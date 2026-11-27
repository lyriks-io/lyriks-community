import { error, type RequestEvent } from '@sveltejs/kit';
import { projectScopeAccess, type ActiveProjectState } from '$application/portfolio/active-project';

/** One reading of the active project per request, however many gates ask. */
const resolved = new WeakMap<App.Locals, Promise<ActiveProjectState | null>>();

/** The installation's active projects for this request: null where the key grants every project. */
export function activeProjectState(locals: App.Locals): Promise<ActiveProjectState | null> {
	let state = resolved.get(locals);
	if (!state) {
		state = locals.services.resolveActiveProject.execute();
		resolved.set(locals, state);
	}
	return state;
}

/**
 * An installation works on as many projects as its key grants, one on
 * Community (EVO-001, EVO-016): an inactive project is neither read nor
 * written, whatever reaches it (a page, Knowledge, Reverse, Changes, Mismatch,
 * an AI client). The 403 carries the project so the error page offers to make
 * it active. No-op where the key grants every project.
 */
export async function requireActiveProject(event: Pick<RequestEvent, 'locals'>, projectId: string): Promise<void> {
	const state = await activeProjectState(event.locals);
	const check = projectScopeAccess(event.locals.services.installEdition(), state, projectId);
	if (!check.ok) error(403, { message: check.reason, detail: check.detail, inactiveProjectId: projectId, activeProjectsGranted: state?.granted });
}

/**
 * The same gate at the edge, for every API call addressed to a project by its
 * path (`/api/.../[projectId]/...`), so no endpoint can forget it. Pages are left
 * to the project layout's `requireProjectAccess`, whose refusal the error page
 * renders with its "Make it the active project" action.
 */
export async function inactiveProjectResponse(
	event: Pick<RequestEvent, 'locals' | 'params' | 'url'>
): Promise<Response | null> {
	const projectId = (event.params as { projectId?: string }).projectId;
	if (!projectId || !event.url.pathname.startsWith('/api/')) return null;
	const state = await activeProjectState(event.locals);
	const check = projectScopeAccess(event.locals.services.installEdition(), state, projectId);
	if (check.ok) return null;
	return new Response(JSON.stringify({ message: check.reason, detail: check.detail, inactiveProjectId: projectId, activeProjectsGranted: state?.granted }), {
		status: 403,
		headers: { 'content-type': 'application/json' }
	});
}
