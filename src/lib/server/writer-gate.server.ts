import type { AppServices } from '$composition/container.server';
import { authEnforced } from '$lib/server/auth-policy.server';
import type { RequestEvent } from '@sveltejs/kit';
import type { GateDoor, RoleVerdict } from '$application/ports';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import { pinnedWorkspace, workspaceForProject } from '$lib/server/caller-workspace.server';
import { mapLimit } from '$lib/shared/map-limit';

/**
 * Whether `token` (the platform session) may pass `door` in the workspace that
 * matters: the active one when `activeWorkspaceId` names a workspace the caller
 * belongs to, else any of theirs. The verdict comes from the role gate port:
 * lyriks-back's roles in Enterprise, the one operator account otherwise (see
 * SingleOperatorRoleGate). Auth off: yes, a single trusted operator with no
 * roles to speak of. Auth on: whatever the gate says, and it fails closed.
 */
export async function tokenHasRole(
	services: AppServices, token: string | null | undefined,
	door: GateDoor,
	activeWorkspaceId: string | null | undefined
): Promise<boolean> {
	if (!authEnforced()) return true;
	return services.roleGate.allows(token, door, activeWorkspaceId);
}

/**
 * The same judgement, keeping apart a refusal from a role source that could not
 * answer (see RoleGatePort.verdict). Auth off: allowed.
 */
export async function tokenRoleVerdict(
	services: AppServices, token: string | null | undefined,
	door: GateDoor,
	activeWorkspaceId: string | null | undefined
): Promise<RoleVerdict> {
	if (!authEnforced()) return 'allowed';
	return services.roleGate.verdict(token, door, activeWorkspaceId);
}

/**
 * The caller's writer status: the session's role in the workspace that owns
 * `projectId`, never the switcher's (a project of no workspace, or no project
 * named as on Home, reads the active one). No-op true when auth is off.
 */
export async function callerCanWrite(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId?: string
): Promise<boolean> {
	if (!event.locals.authRequired) return true;
	const pinned = pinnedWorkspace(event);
	const workspaceId = projectId ? await workspaceForProject(event.locals.services, projectId, pinned) : pinned;
	return event.locals.services.roleGate.allows(event.cookies.get(SESSION_COOKIE), 'write', workspaceId);
}

/**
 * The caller's writer status on each project of a list, read the way
 * callerCanWrite reads one: in the workspace that owns the project (the pinned
 * one for a project of none). A list spanning several workspaces, as on Home,
 * asks the role gate once per workspace, never once per project. Every project
 * is writable when auth is off.
 */
export async function callerCanWriteEach(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectIds: readonly string[]
): Promise<ReadonlyMap<string, boolean>> {
	if (!event.locals.authRequired) return new Map(projectIds.map((id) => [id, true]));
	const services = event.locals.services;
	const pinned = pinnedWorkspace(event);
	const token = event.cookies.get(SESSION_COOKIE);
	const owners = await mapLimit(projectIds, 8, (id) => workspaceForProject(services, id, pinned));
	const verdicts = new Map<string | null, Promise<boolean>>();
	for (const workspaceId of owners) {
		if (!verdicts.has(workspaceId)) verdicts.set(workspaceId, services.roleGate.allows(token, 'write', workspaceId));
	}
	const writes = await Promise.all(owners.map((workspaceId) => verdicts.get(workspaceId)!));
	return new Map(projectIds.map((id, i) => [id, writes[i]]));
}
