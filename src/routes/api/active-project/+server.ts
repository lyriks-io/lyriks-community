import { error, json } from '@sveltejs/kit';
import { authorizeProjectAccess } from '$lib/server/project-access.server';
import { activeProjectState } from '$lib/server/active-project.server';
import type { RequestHandler } from './$types';

/**
 * The project a Community installation works on (EVO-001).
 *
 *   GET  /api/active-project              -> { activeProjectId } (null off Community)
 *   POST /api/active-project { projectId } -> makes it active; the previous one becomes inactive
 *
 * Kept off `/api/projects/[projectId]/...` on purpose: those paths are refused
 * for an inactive project, and this is the one call that opens it.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const state = await activeProjectState(locals);
	return json({ activeProjectId: state?.activeProjectId ?? null });
};

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as { projectId?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	// The caller's own access, without the active-project gate this call lifts.
	await authorizeProjectAccess(event, projectId, 'write');
	const result = await event.locals.services.makeProjectActive.execute(projectId);
	if (!result.ok) {
		if (result.reason === 'not_found') error(404, 'Project not found');
		error(409, 'Every project is open on this edition: there is no active project to choose.');
	}
	event.locals.services.audit.record({
		action: 'project.activate',
		actor: event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev'),
		target: projectId,
		outcome: 'success',
		detail: result.previousProjectId ? `previous ${result.previousProjectId}` : undefined
	});
	return json({ activeProjectId: result.activeProjectId, previousProjectId: result.previousProjectId });
};
