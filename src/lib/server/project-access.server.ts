import { error, type RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { AccessAction } from '$application/ports';
import { callerCanSeeProject } from '$lib/server/project-scope.server';

/** httpOnly cookie carrying the back JWT (see hooks.server.ts). */
const COOKIE = 'lyriks_session';

/**
 * Per-request authorization gate for a project-scoped route or page load.
 *
 *  - Auth OFF (standalone appliance / dev): single trusted user — no-op.
 *  - Auth ON: the caller's JWT is checked against lyriks-back; throws 401/403/404
 *    if the user may not `action` this project. The bearer token is read from the
 *    cookie here and never leaves the server. On top of workspace membership, a
 *    per-project visibility scope applies: a non-blanket member (not owner/admin
 *    and not granted "all projects") may only reach projects within their domain
 *    breadth or whose team they are on (see `callerCanSeeProject`) — a project they
 *    can't see is reported as 404, not 403, so scope never leaks which projects exist.
 *
 * `event` is anything carrying `locals` + `cookies` — a SvelteKit RequestEvent
 * or a load event both qualify.
 */
export async function requireProjectAccess(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
	action: AccessAction
): Promise<void> {
	if (!event.locals.authRequired) return;

	const token = event.cookies.get(COOKIE) ?? null;
	const decision = await getServices().projectAccess.authorize(projectId, token, action);
	if (!decision.ok) {
		if (decision.reason === 'unauthenticated') error(401, 'unauthenticated');
		if (decision.reason === 'not_found') error(404, 'Project not found');
		error(403, 'forbidden');
	}

	// Workspace membership passed; now the per-project visibility scope (domain
	// breadth ∪ collaborator grants). Hide a project the caller isn't scoped to as
	// a 404 (same shape as a non-member), so the boundary doesn't reveal it exists.
	if (!(await callerCanSeeProject(event, projectId))) {
		error(404, 'Project not found');
	}
}
