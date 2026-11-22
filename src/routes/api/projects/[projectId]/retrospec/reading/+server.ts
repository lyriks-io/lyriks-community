import { error, json } from '@sveltejs/kit';
import { parseRetrospecReading } from '$application/retrospec/parse-retrospec-reading';
import { loadRetrospecDocument, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import { currentRun, specEditLines, specEditStatus, waitsForItsPrompt, type RetrospecAct, type RetrospecDocument } from '$domain/retrospec';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { retrospecActor } from '$lib/server/retrospec-status.server';
import type { RequestHandler } from './$types';

/**
 * What a person's AI reports of the retrospecification it runs (criteria
 * c50587fb, 8c9bfffe, 23397c95 of feat-mcp-authoring), the MCP's
 * report_retrospec_reading.
 *
 *   GET  → where the run stands (complementary or whole, the commit it starts
 *          from and the one it recorded) and the hand edits Code drift lists.
 *   POST `{ received?: true, commit?: { sha, repository? }, checks?: [{ anchor, says: 'same' | 'other', code?, where? }] }`
 *        → records them on the run under way and answers the same reading.
 *          `received` moves on the run that waits for its prompt (criterion
 *          a6f870af) and records nothing when none does: the AI goes on.
 *          `changes`, `finished` and `written` are what a run that holds its
 *          changes reports (criteria 50b00229, 1aaa8316); `withdrawn` takes off
 *          the report a change a person rejected as not being one (criterion eb132bbd).
 *          `phase` and `read` say the phase the AI reads now and the features it
 *          finished re-reading (EVO-014, actions 83ba020b and ef746636): what a
 *          run that writes nothing as it reads is followed by on Mismatch.
 */
function readingOf(doc: RetrospecDocument) {
	const run = currentRun(doc);
	return {
		run: run
			? {
					id: run.id,
					mode: run.mode,
					underWay: !run.publishedAt,
					complementary: run.complementary ? { fromRun: run.complementary.fromRunId, fromCommit: run.complementary.fromCommit } : null,
					commit: run.commit ?? null,
					holdsChanges: !!run.holds,
					writingOpen: !!run.writingOpenedAt,
					phase: run.phaseReported ?? null,
					featuresRead: run.featuresRead?.length ?? 0,
					report: Object.values(run.report ?? {}).map((c) => ({ id: c.id, kind: c.kind, anchor: c.anchor, dock: c.dock, title: c.title, proposed: c.proposed, code: c.code, where: c.where, decision: c.decision?.verdict ?? null, asked: c.decision?.note ?? null }))
				}
			: null,
		handEdits: specEditLines(doc.specEdits).map((e) => ({
			anchor: e.itemId,
			kind: e.itemId.split(':', 1)[0],
			featureId: e.featureId,
			before: e.before,
			now: e.after,
			status: specEditStatus(e),
			changedBy: e.by.name,
			changedAt: e.at
		}))
	};
}

export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const { doc } = await loadRetrospecDocument(event.locals.services.sectionDocuments, projectId);
	return json(readingOf(doc));
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseRetrospecReading(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	const { commit, checks, received, changes, withdrawn, finished, written, phase, read } = parsed.reading;
	const { doc: before } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	const acts: RetrospecAct[] = [
		...(received && waitsForItsPrompt(before) ? [{ op: 'launch' as const }] : []),
		...(phase ? [{ op: 'report_phase' as const, phase }] : []),
		...(read.length > 0 ? [{ op: 'report_read' as const, featureIds: read }] : []),
		...(commit ? [{ op: 'record_commit' as const, sha: commit.sha, repository: commit.repository }] : []),
		...(checks.length > 0 ? [{ op: 'check_spec_edits' as const, reports: checks }] : []),
		...(changes.length > 0 ? [{ op: 'report_changes' as const, changes }] : []),
		...(withdrawn.length > 0 ? [{ op: 'withdraw_changes' as const, ids: withdrawn }] : []),
		...(written.length > 0 ? [{ op: 'record_written' as const, written }] : []),
		...(finished ? [{ op: 'end_reading' as const }] : [])
	];
	if (acts.length === 0) return json({ ok: true, recorded: [], ...readingOf(before) });
	const actor = await retrospecActor(services, projectId, event.cookies);
	const outcome = await saveRetrospecActs(services.sectionDocuments, projectId, acts, { actor, now: new Date().toISOString() }, event.request.headers.get('x-lyriks-client'));
	if (!outcome.ok) error(outcome.conflict ? 409 : 400, outcome.reason);
	const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
	return json({ ok: true, recorded: acts.map((a) => a.op), ...readingOf(doc) });
};
