import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { canSettle, reopenGap, settleGap } from '$domain/coherence';
import type { RequestHandler } from './$types';

/**
 * Decide about a coherence gap: accept the risk, decide not to fix it, or
 * reopen a settled one. Server-side on purpose: the author is the caller's
 * session (never a client-supplied name), the gap must be open right now (a
 * stale card cannot settle what a fresh analysis no longer reports), and a
 * blocking gap is refused here exactly as the domain refuses it.
 *
 * The write goes through the coherence section's own save path, so the
 * revision lock and the change event hold: other tabs re-run the layout and see
 * the ring move; the caller invalidates its own.
 */
export const POST: RequestHandler = async (event) => {
	const { request, params } = event;
	const projectId = params.projectId;
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'write');
	const body = (await request.json().catch(() => ({}))) as {
		gapId?: unknown;
		gapTitle?: unknown;
		status?: unknown;
		reason?: unknown;
	};
	const gapId = typeof body.gapId === 'string' ? body.gapId.trim() : '';
	const reason = typeof body.reason === 'string' ? body.reason : '';
	const status = body.status;
	if (!gapId) error(400, 'gapId is required');
	if (status !== 'accepted_risk' && status !== 'wont_fix' && status !== 'reopened')
		error(400, 'status must be accepted_risk, wont_fix or reopened');

	const services = getServices();
	const session = services.currentSession();
	const author = { id: session.email ?? 'local', kind: 'person' as const };
	const view = await services.loadCoherenceDraft.execute(projectId);
	const now = services.clock.nowIso();
	const id = `decision-${crypto.randomUUID().slice(0, 8)}`;

	let next;
	if (status === 'reopened') {
		const settled = view.analysis.settled?.find((s) => s.gap.id === gapId);
		if (!settled && !view.draft.acknowledgedGapIds.includes(gapId))
			error(409, { message: 'This gap is not settled; nothing to reopen.' });
		next = reopenGap(view.draft, gapId, author, reason, id, now);
	} else {
		const gap = view.analysis.gaps.find((g) => g.id === gapId);
		const verdict = canSettle(gap, author, reason);
		if (!verdict.ok) error(409, { message: verdict.why });
		const gapTitle = gap?.title ?? (typeof body.gapTitle === 'string' ? body.gapTitle : gapId);
		next = settleGap(view.draft, { gapId, gapTitle, status, reason, author }, id, now);
	}

	const result = await services.saveCoherenceDraft.execute(next, {
		expectedRevision: await services.sectionDocuments.currentRevision(projectId, 'coherence'),
		origin: request.headers.get('x-lyriks-client')
	});
	if (result === null) error(409, { message: 'The coherence section changed meanwhile. Try again.' });
	return json({ ok: true, decisionId: id, coherenceScore: result.coherenceScore, revision: result.revision });
};
