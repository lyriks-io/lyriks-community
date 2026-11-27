import { error, json } from '@sveltejs/kit';
import { authorizeProjectAccess } from '$lib/server/project-access.server';
import { activeProjectState } from '$lib/server/active-project.server';
import type { RequestHandler } from './$types';

/**
 * The projects an installation works on (EVO-001; EVO-016, N of them where the
 * key grants N).
 *
 *   GET  /api/active-project
 *     -> { activeProjectId, activeProjectIds, granted } (nulls where the key grants every project)
 *   POST /api/active-project { projectId, setAsideProjectId? }
 *     -> makes it active; with every place taken, the one active project is set
 *        aside, or with several the one named. Without one named it answers 409
 *        { reason: "choose_set_aside", activeProjects } for the person to pick.
 *
 * Kept off `/api/projects/[projectId]/...` on purpose: those paths are refused
 * for an inactive project, and this is the one call that opens it.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const state = await activeProjectState(locals);
	return json({
		activeProjectId: state?.activeProjectIds[0] ?? null,
		activeProjectIds: state?.activeProjectIds ?? null,
		granted: state?.granted ?? null
	});
};

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as { projectId?: unknown; setAsideProjectId?: unknown } | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	const setAside = typeof body?.setAsideProjectId === 'string' && body.setAsideProjectId ? body.setAsideProjectId : undefined;
	// The caller's own access, without the active-project gate this call lifts.
	await authorizeProjectAccess(event, projectId, 'write');
	const result = await event.locals.services.makeProjectActive.execute(projectId, setAside);
	if (!result.ok) {
		if (result.reason === 'not_found') error(404, 'Project not found');
		if (result.reason === 'choose_set_aside')
			return json(
				{ reason: 'choose_set_aside', message: 'Choose the active project to set aside.', activeProjects: result.activeProjects },
				{ status: 409 }
			);
		error(409, 'Every project is open on this installation: there is no active project to choose.');
	}
	event.locals.services.audit.record({
		action: 'project.activate',
		actor: event.locals.session?.email ?? (event.locals.authRequired ? 'anonymous' : 'dev'),
		target: projectId,
		outcome: 'success',
		detail: result.previousProjectId ? `previous ${result.previousProjectId}` : undefined
	});
	return json({ activeProjectId: projectId, activeProjectIds: result.activeProjectIds, previousProjectId: result.previousProjectId });
};
