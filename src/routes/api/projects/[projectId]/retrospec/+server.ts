import { error, json } from '@sveltejs/kit';
import { parseRetrospecActs } from '$application/retrospec/parse-retrospec-acts';
import { loadRetrospecDocument, saveRetrospecActs } from '$application/retrospec/retrospec-store';
import { applyRetrospecActs, currentRun, type ActContext, type RetrospecAct } from '$domain/retrospec';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { readSpecElements } from '$lib/server/spec-elements.server';
import { readNextRun, readRetrospecEvents, readRetrospecStatus, retrospecActor } from '$lib/server/retrospec-status.server';
import { callerKind } from '$lib/server/caller.server';
import { readValidationGuards } from '$lib/server/spec-validation.server';
import { startWriting, validatedChangesRefusal, writingUnderWay } from '$lib/server/retrospec-writing.server';
import type { RequestHandler } from './$types';

const fingerprintsOf = (elements: readonly { readonly id: string; readonly fingerprint?: string | null }[]) =>
	Object.fromEntries(elements.flatMap((e) => (e.fingerprint ? [[e.id, e.fingerprint] as const] : [])));

/** The acts this door shares with Knowledge's validation, which therefore answer to its guards (criteria 6972f3ea, 7a8555f6). */
const GUARDED_OPS: ReadonlySet<string> = new Set(['validate', 'withdraw', 'publish']);

/**
 * The retrospecification of one project.
 *
 *   GET  → `{ status }`, and `events` too with `?events=1` (newest first).
 *   POST `{ acts: [...] }` → applies a person's acts (start, launch, validate,
 *        reject, set aside, share, comment, publish…) and answers `{ ok, revision }`.
 *
 * A start records the specification's revisions as the run's baseline, read
 * here, never from the body. What it reads is the person's choice (Full,
 * Delta or Resume analysis, EVO-014) or, left out, the default the server
 * reads; where the last run stopped is read here too. Validate, withdraw and publish answer to the same
 * guards as Knowledge's validation: a validation only from someone the element
 * waits on, a publication only once every element is validated. A publish first
 * records a baseline (the version of the specification is counted from it),
 * then keeps its id on the run; an act the run refuses answers 400 with its
 * reason, before anything is recorded. `open_writing` and `write_remaining`
 * have Lyriks write the validated changes itself, in the background, once each
 * of them was checked against the specification as it stands (feat-120).
 */
export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const [status, events] = await Promise.all([
		readRetrospecStatus(event.locals.services, projectId),
		event.url.searchParams.get('events') === '1' ? readRetrospecEvents(event.locals.services, projectId) : Promise.resolve(undefined)
	]);
	return json(events ? { status, events } : { status });
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	if (!(await services.projectExists(projectId))) error(404, 'Project not found');
	const parsed = parseRetrospecActs(await event.request.json().catch(() => null));
	if (!parsed.ok) error(400, parsed.reason);
	// A person decides what enters the specification, never their AI (criterion 50b00229).
	if (callerKind(event.request) === 'ai_client' && parsed.acts.some((a) => a.op === 'decide_change' || a.op === 'validate_changes' || a.op === 'open_writing' || a.op === 'write_remaining' || a.op === 'leave_out_change')) error(403, 'A person decides on a change of the report, never their AI.');
	const writes = parsed.acts.some((a) => a.op === 'open_writing' || a.op === 'write_remaining');
	// One writing at a time (rule 47964da1), and none of a change that no longer applies (rule c9c94526).
	if ((writes || parsed.acts.some((a) => a.op === 'leave_out_change')) && writingUnderWay(projectId)) error(409, 'Lyriks is writing the validated changes already.');
	const origin = event.request.headers.get('x-lyriks-client');
	const actor = await retrospecActor(services, projectId, event.cookies);
	const now = new Date().toISOString();
	const guards = parsed.acts.some((a) => GUARDED_OPS.has(a.op)) ? await readValidationGuards(services, projectId, actor) : {};
	const ctx: ActContext = { actor, now, ...guards };

	const needsBaseline = parsed.acts.some((a) => a.op === 'start');
	// The baseline, what the next run reads by default, where the last run stopped and whether it closes, read once (EVO-014).
	const next = needsBaseline ? await readNextRun(services, projectId) : null;
	const baseline = next?.baseline ?? {};
	// What each element reads as the run starts: the validations it carries stand against it when the last validated run recorded nothing (criterion 0c87480c).
	const elements = needsBaseline ? await readSpecElements(services, projectId).catch(() => []) : [];
	const fingerprints = fingerprintsOf(elements);
	// Their names too: an element a later run removes has nothing else left to be named by (criterion 03192a6e).
	const titles = Object.fromEntries(elements.map((e) => [e.id, e.title]));
	// Whether the analysis of the last run is over, read here, never from the body: a start then closes that run (criterion 2dbed801).
	const closesRun = next?.closesRun ?? false;
	const resolve = (baselineId: string | null): RetrospecAct[] =>
		parsed.acts.map((a): RetrospecAct =>
			a.op === 'start'
				? { op: 'start', mode: a.mode, baseline, fingerprints, titles, scope: a.scope ?? next?.scope ?? 'delta', resumable: next?.resumable ?? null, closesRun }
				: a.op === 'publish'
					? { op: 'publish', baselineId }
					: a
		);

	let baselineId: string | null = null;
	if (parsed.acts.some((a) => a.op === 'publish')) {
		// Refused acts never leave a baseline behind them: try the batch first.
		const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
		const dry = applyRetrospecActs(doc, resolve(null), ctx);
		if (!dry.ok) error(400, dry.reason);
		const identity = await services.loadFoundationDraft.loadIdentity(projectId);
		const product = identity.productName.trim() || 'the product';
		const captured = await services.captureBaseline.execute(projectId, `Reverse-Specification of ${product}`, { expectedRevision: null, origin });
		if (!captured) error(409, 'The baselines changed while publishing. Try again.');
		baselineId = captured.draft.baselines[0]?.id ?? null;
	}

	if (writes) {
		const { doc } = await loadRetrospecDocument(services.sectionDocuments, projectId);
		const dry = applyRetrospecActs(doc, resolve(null), ctx);
		if (!dry.ok) error(400, dry.reason);
		const run = currentRun(dry.doc);
		const refusal = run ? await validatedChangesRefusal(services, projectId, run) : null;
		if (refusal) error(409, refusal);
	}

	const outcome = await saveRetrospecActs(services.sectionDocuments, projectId, resolve(baselineId), ctx, origin);
	if (!outcome.ok) error(outcome.conflict ? 409 : 400, outcome.reason);
	if (writes) startWriting(services, projectId, origin);
	return json({ ok: true, revision: outcome.revision });
};
