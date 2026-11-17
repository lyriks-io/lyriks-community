import type { RequestEvent } from '@sveltejs/kit';
import type { AppServices } from '$composition/container.server';
import type { WorkspaceSummary } from '$application/ports';
import { pickActiveWorkspace } from '$application/portfolio/active-workspace';

export { pickActiveWorkspace };

/** The cookie the workspace switcher pins. */
export const ACTIVE_WORKSPACE_COOKIE = 'lyriks_active_ws';

/** The workspace the browser pinned with the switcher, if any: unvalidated, so only ever compared with the caller's own list. */
export function pinnedWorkspace(event: Pick<RequestEvent, 'cookies'>): string | null {
	return event.cookies.get(ACTIVE_WORKSPACE_COOKIE) ?? null;
}

/**
 * The workspace that owns a project: the one the project is registered in on
 * the team server. Null where projects belong to no workspace (Community,
 * sign-in off, the one operator account) or the project is not registered.
 * Every question about a project (who may see it, which role acts on it) is
 * answered in this workspace, never in the one the switcher shows.
 */
export async function projectWorkspaceId(services: Pick<AppServices, 'backLinks'>, projectId: string): Promise<string | null> {
	const link = await services.backLinks.find(projectId).catch(() => null);
	return link?.backWorkspaceId ?? null;
}

/**
 * The workspace a question about a project is answered in: the one that owns
 * it, else, for a project that belongs to no workspace, the one the switcher
 * pinned (null when none is pinned).
 */
export async function workspaceForProject(
	services: Pick<AppServices, 'backLinks'>,
	projectId: string,
	pinned: string | null | undefined
): Promise<string | null> {
	return (await projectWorkspaceId(services, projectId)) ?? pinned ?? null;
}

/**
 * The name the whole app gives the caller where a project is concerned: their
 * member name in the workspace that owns it (the pinned one for a project of
 * none), never in the one the switcher shows; else the operator profile's
 * name, else one derived from their email.
 */
export async function callerNameForProject(
	services: Pick<AppServices, 'backLinks' | 'resolveActiveMemberName'>,
	projectId: string,
	pinned: string | null | undefined
): Promise<string> {
	return services.resolveActiveMemberName.execute(await workspaceForProject(services, projectId, pinned));
}

/**
 * The caller's own entry (id and role) for the workspace a project is acted on
 * in: the one that owns the project, never the one the switcher shows; for a
 * project that belongs to no workspace, the one the switcher shows. Null when
 * the caller is not in that workspace, or belongs to none.
 */
export async function callerWorkspaceForProject(
	services: Pick<AppServices, 'backLinks' | 'workspaces'>,
	projectId: string,
	pinned: string | null | undefined
): Promise<WorkspaceSummary | null> {
	const [owning, workspaces] = await Promise.all([projectWorkspaceId(services, projectId), services.workspaces.listForCaller()]);
	if (owning) return workspaces.find((workspace) => workspace.id === owning) ?? null;
	return pickActiveWorkspace(workspaces, pinned);
}

/**
 * The caller's role in the workspace that owns a project (owner, admin,
 * designer, viewer), never the one the switcher shows. Null where the project
 * belongs to no workspace, the caller is not in it, or the team server cannot
 * say: whatever needs a role then falls back to its stricter rule.
 */
export async function callerRoleInProjectWorkspace(
	services: Pick<AppServices, 'backLinks' | 'workspaces'>,
	projectId: string
): Promise<string | null> {
	const workspaceId = await projectWorkspaceId(services, projectId);
	if (!workspaceId) return null;
	const workspaces = await services.workspaces.listForCaller().catch(() => []);
	return workspaces.find((workspace) => workspace.id === workspaceId)?.role ?? null;
}
