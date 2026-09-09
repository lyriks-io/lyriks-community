import type { RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';

/**
 * The set of workspace ids the current caller may enumerate, for scoping the flat
 * project catalog on list/search endpoints.
 *
 *  - Auth OFF (standalone appliance / dev): single trusted tenant → `null`
 *    (no filtering, unchanged behaviour).
 *  - Auth ON: the caller's actual workspaces from lyriks-back (token-scoped,
 *    unforgeable). Fail-closed: if the back is unreachable the set is empty, so an
 *    enumeration returns nothing rather than leaking every tenant's projects.
 */
export async function callerWorkspaceScope(
	event: Pick<RequestEvent, 'locals'>
): Promise<ReadonlySet<string> | null> {
	if (!event.locals.authRequired) return null;
	// A single-operator install (auth on, no Back) has no teams to scope by either.
	if (!getServices().identity.multiUser) return null;
	try {
		const workspaces = await getServices().workspaces.listForCaller();
		return new Set(workspaces.map((w) => w.id));
	} catch {
		return new Set<string>();
	}
}
