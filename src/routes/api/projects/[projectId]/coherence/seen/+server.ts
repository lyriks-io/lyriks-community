import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { seenSectionFor } from '$lib/server/coherence-visit.server';
import type { RequestHandler } from './$types';

/**
 * Record what this person saw open in the Control Center, so the next opening
 * can say what is new and what got resolved meanwhile. Per person, per project,
 * as a project residue document (no schema, no revision lock: the last mark wins).
 */
export const POST: RequestHandler = async (event) => {
	const { request, params } = event;
	const projectId = params.projectId;
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const body = (await request.json().catch(() => ({}))) as { gapIds?: unknown };
	const gapIds = Array.isArray(body.gapIds)
		? body.gapIds.filter((g): g is string => typeof g === 'string' && g.length > 0)
		: [];
	const services = getServices();
	const session = services.currentSession();
	await services.projectResidue.save(projectId, seenSectionFor(session.email), {
		gapIds,
		at: services.clock.nowIso()
	});
	return json({ ok: true });
};
