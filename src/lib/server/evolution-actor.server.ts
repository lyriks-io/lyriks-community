import type { RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { Actor } from '$domain/evolution';
import { ACTOR_HEADER, callerKind } from './caller.server';
import { authEnforced } from './auth-policy.server';
import { pickActiveWorkspace, projectWorkspaceId } from './caller-workspace.server';
import { writesIn } from '$application/portfolio/project-visibility';

/**
 * Who is acting on the Evolution section, resolved once server-side.
 *
 * The distinction person / AI client is load-bearing all through the lifecycle
 * (a client writes and reports, a person decides), so it is read from the
 * request rather than trusted from a body field: the MCP names itself with the
 * `x-lyriks-actor: ai_client` header, and nothing else does.
 *
 * A client may RELAY the signed-in person's decision (`as_person`): the act
 * then lands as the person's own, with the channel stamped so the timeline says
 * it came through the client. A relay with nobody signed in is refused upstream
 * (the session gate), so here the person is always known.
 */
export { ACTOR_HEADER };

export async function resolveEvolutionActor(
	services: AppServices,
	event: Pick<RequestEvent, 'request' | 'cookies'>,
	projectId: string,
	opts: { readonly asPerson?: boolean } = {}
): Promise<Actor> {
	const personId = currentPersonId(services);
	const role = await resolveRole(services, projectId, event.cookies.get('lyriks_active_ws'));
	const isClient = callerKind(event.request) === 'ai_client';
	if (!isClient) return { id: personId, kind: 'person', role, channel: 'page' };
	if (opts.asPerson) return { id: personId, kind: 'person', role, channel: 'ai_client' };
	return { id: personId, kind: 'ai_client', role, channel: 'ai_client' };
}

/**
 * The signed-in person. With auth off (a local install, a dev setup) the
 * session has no email: the one operator of the box is the person, under a
 * name the history can read.
 */
export function currentPersonId(services: Pick<AppServices, 'currentSession'>): string {
	return services.currentSession().email ?? 'local-operator';
}

/**
 * The caller's role on a project, read in the workspace that owns it (issue 80),
 * the way the door does: never in the one the switcher shows, and the same for
 * an AI client, which carries no switcher. A designer reads as `member`, the
 * writer of the request vocabulary. A project no workspace owns (Community,
 * sign-in off, the one operator account) reads the switcher's workspace, if
 * any, else the narrower writer role. On a team installation a role that
 * cannot be read counts as viewer, never as a role that may write.
 */
export async function resolveRole(
	services: AppServices,
	projectId: string,
	activeWorkspaceId: string | undefined
): Promise<Actor['role']> {
	const teamInstallation = authEnforced() && services.identity.multiUser;
	try {
		const [owning, workspaces] = await Promise.all([projectWorkspaceId(services, projectId), services.workspaces.listForCaller()]);
		const where = owning ? workspaces.find((w) => w.id === owning) : pickActiveWorkspace(workspaces, activeWorkspaceId);
		if (!where) return teamInstallation ? 'viewer' : 'member';
		return actorRole(where.role);
	} catch (err) {
		console.warn('[evolution] workspace role unavailable:', err);
		return teamInstallation ? 'viewer' : 'member';
	}
}

/** A workspace role in the request vocabulary: designer (and any other writer) is `member`. */
function actorRole(role: string): Actor['role'] {
	if (role === 'owner' || role === 'admin' || role === 'viewer') return role;
	return writesIn(role) ? 'member' : 'viewer';
}
