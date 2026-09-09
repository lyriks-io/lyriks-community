import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { reconcileImplementationStatuses } from '$lib/server/implementation-reconcile.server';
import type { RequestHandler } from './$types';

/**
 * Align feature workflow statuses with the recorded implementation coverage:
 * a feature whose spec entities are all located in code becomes `done`, a
 * partially-located one leaves `backlog` for `in-progress`. Upgrade-only, so
 * an offline engine (or a feature never adopted) can never reset a roadmap.
 *
 * The implementation sync routes fire this automatically after a landed sync;
 * this endpoint is the explicit form for MCP clients and the dashboard.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureIds?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	const featureIds = Array.isArray(body?.featureIds)
		? body.featureIds.filter((id): id is string => typeof id === 'string')
		: undefined;

	await requireProjectAccess(event, projectId, 'write');
	const changes = await reconcileImplementationStatuses(projectId, featureIds);
	return json({
		ok: true,
		changes,
		semantics: {
			changes:
				'Feature statuses raised to match code coverage (never lowered). Empty means everything already agreed, or no coverage is recorded yet.'
		}
	});
};
