import { authEnforced } from '$lib/server/auth-policy.server';
import type { RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { GateDoor } from '$application/ports';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';

/**
 * Whether `token` (the platform session) may pass `door` in the workspace that
 * matters: the active one when `activeWorkspaceId` names a workspace the caller
 * belongs to, else any of theirs. The verdict comes from the role gate port:
 * lyriks-back's roles in Enterprise, the one operator account otherwise (see
 * SingleOperatorRoleGate). Auth off: yes, a single trusted operator with no
 * roles to speak of. Auth on: whatever the gate says, and it fails closed.
 */
export async function tokenHasRole(
	token: string | null | undefined,
	door: GateDoor,
	activeWorkspaceId: string | null | undefined
): Promise<boolean> {
	if (!authEnforced()) return true;
	return getServices().roleGate.allows(token, door, activeWorkspaceId);
}

/**
 * The caller's writer status for a page load or a hook: the session cookie's
 * role in the active workspace (`lyriks_active_ws`, else the first one). No-op
 * true when auth is off.
 */
export async function callerCanWrite(
	event: Pick<RequestEvent, 'locals' | 'cookies'>
): Promise<boolean> {
	if (!event.locals.authRequired) return true;
	return getServices().roleGate.allows(event.cookies.get(SESSION_COOKIE), 'write', event.cookies.get('lyriks_active_ws'));
}
