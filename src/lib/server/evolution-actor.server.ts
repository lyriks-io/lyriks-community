import type { RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { Actor } from '$domain/evolution';
import { ACTOR_HEADER, callerKind } from './caller.server';

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
	opts: { readonly asPerson?: boolean } = {}
): Promise<Actor> {
	const session = services.currentSession();
	// With auth off (a local install, a dev setup) the session has no email: the
	// one operator of the box is the person, under a name the history can read.
	const personId = session.email ?? 'local-operator';
	const role = await resolveRole(services, event.cookies.get('lyriks_active_ws'));
	const isClient = callerKind(event.request) === 'ai_client';
	if (!isClient) return { id: personId, kind: 'person', role, channel: 'page' };
	if (opts.asPerson) return { id: personId, kind: 'person', role, channel: 'ai_client' };
	return { id: personId, kind: 'ai_client', role, channel: 'ai_client' };
}

/**
 * The caller's workspace role. Best-effort: a standalone install with no Back
 * still renders the board, with the narrower of the two roles.
 */
export async function resolveRole(
	services: AppServices,
	activeWorkspaceId: string | undefined
): Promise<Actor['role']> {
	try {
		const workspaces = await services.workspaces.listForCaller();
		const active = (activeWorkspaceId && workspaces.find((w) => w.id === activeWorkspaceId)) || workspaces[0];
		if (active?.role === 'owner' || active?.role === 'admin') return active.role;
		if (active?.role === 'viewer') return 'viewer';
		return 'member';
	} catch (err) {
		console.warn('[evolution] workspace role unavailable, acting as member:', err);
		return 'member';
	}
}
