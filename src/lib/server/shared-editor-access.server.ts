import type { RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { isAdmin } from './admin.server';

/** The upstream edits the entire store; a workspace grant cannot authorize it. */
export function canUseSharedEditor(event: Pick<RequestEvent, 'locals'>): boolean {
	if (!event.locals.authRequired) return true;
	if (!event.locals.session?.isAuthenticated) return false;
	return !getServices().identity.multiUser || isAdmin(event);
}
