import type { RequestEvent } from '@sveltejs/kit';
import { foldersIn, type CallerReach } from '$application/portfolio/project-visibility';

type ScopeEvent = Pick<RequestEvent, 'locals' | 'cookies'>;

/** One reading per request: the layout, the page and the hooks of one request ask the same thing. */
const read = new WeakMap<App.Locals, Promise<CallerReach | null>>();

/**
 * What the caller reaches in each workspace they belong to, or null when
 * nothing is scoped. The open-source build is a single operator who reaches
 * everything, and auth off is the same trusted tenant; where the Enterprise
 * overlay is compiled in, its hook reads the caller's workspaces, their role
 * and their folders in each.
 */
export function callerReach(event: ScopeEvent): Promise<CallerReach | null> {
	if (!event.locals.authRequired) return Promise.resolve(null);
	const hooks = event.locals.services.enterpriseHooks;
	if (!hooks) return Promise.resolve(null);
	let reach = read.get(event.locals);
	if (!reach) {
		reach = hooks.callerReach(event);
		read.set(event.locals, reach);
	}
	return reach;
}

/**
 * The folder ids the caller reaches in one workspace, or `null` for every
 * folder: the workspace of the project or the folder acted on, the one the
 * switcher shows when none is named (a new folder lands there).
 */
export async function callerAllowedDomains(
	event: ScopeEvent,
	workspaceId?: string | null
): Promise<ReadonlySet<string> | null> {
	const reach = await callerReach(event);
	if (reach === null) return null;
	return foldersIn(reach, workspaceId === undefined ? reach.activeId : workspaceId);
}
