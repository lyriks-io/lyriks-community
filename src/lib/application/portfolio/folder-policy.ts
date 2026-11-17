import type { Domain } from '$domain/portfolio';
import { foldersIn, writesIn, type CallerReach } from './project-visibility';

/**
 * Who may do what with the folders of the projects (feature "Organise projects
 * in folders"). A folder belongs to the workspace it was created in (issue 156):
 * only that workspace's members see it, and what they may do with it is read in
 * that workspace, never in the one the switcher shows (issue 150). A viewer,
 * who changes no project, does not arrange the folders either (issue 155).
 * `reach` null is an installation with nothing to scope: every act is allowed.
 */

/** Refusal of rules 509fa7a1 and ed4ab638: adding a folder needs every folder of the workspace in reach. */
export const FOLDER_SCOPE_REFUSAL = 'Only members with full portfolio access can create domains';
/** Refusal of rule f98a832d: the order is the same for everyone. */
export const FOLDER_ORDER_REFUSAL = 'Only members who see every folder can change their order';
/** Refusal of rules cfc8ad95, e2a7dc48, 2ceaa1cb and d4e01c6f. */
export const VIEWER_FOLDER_REFUSAL = 'A viewer cannot change the folders.';
/** Refusal of rules f019e036 and 26a92163: a folder out of reach reads as absent. */
export const FOLDER_NOT_FOUND = 'Domain not found';
/** Refusal of rules 3872a8b7 and a8664b7b: a project is filed only in a folder of its workspace the caller reaches. */
export const FOLDER_OUT_OF_SCOPE = 'The target domain is outside your portfolio scope';

export type FolderVerdict =
	| { readonly ok: true }
	| { readonly ok: false; readonly status: 403 | 404; readonly reason: string };

const allowed: FolderVerdict = { ok: true };
const refused = (status: 403 | 404, reason: string): FolderVerdict => ({ ok: false, status, reason });

/** Whether the caller sees this folder: one of their workspaces', and in their folders there. */
export function folderVisibleTo(reach: CallerReach | null, domain: Domain): boolean {
	if (reach === null) return true;
	const workspaceId = domain.workspaceId ?? null;
	if (!workspaceId || !reach.workspaces.has(workspaceId)) return false;
	const folders = foldersIn(reach, workspaceId);
	return folders === null || folders.has(domain.id);
}

/** The folders the caller lists (action a34fe7c0): never another workspace's. */
export function foldersVisibleTo(reach: CallerReach | null, domains: readonly Domain[]): Domain[] {
	return domains.filter((domain) => folderVisibleTo(reach, domain));
}

/** The folders of the caller's workspaces, whatever their breadth there: the ones an order names. */
export function foldersOfWorkspaces(reach: CallerReach | null, domains: readonly Domain[]): Domain[] {
	if (reach === null) return [...domains];
	return domains.filter((domain) => !!domain.workspaceId && reach.workspaces.has(domain.workspaceId));
}

/**
 * Where a new folder lands (action f31accb5): the workspace the switcher shows,
 * for a writer who reaches every folder there. Null on an installation without
 * workspaces.
 */
export function folderCreation(reach: CallerReach | null): FolderVerdict & { readonly workspaceId?: string | null } {
	if (reach === null) return { ok: true, workspaceId: null };
	const workspaceId = reach.activeId;
	const inWorkspace = workspaceId ? reach.workspaces.get(workspaceId) : undefined;
	if (!workspaceId || !inWorkspace || inWorkspace.folders !== null) return refused(403, FOLDER_SCOPE_REFUSAL);
	if (!writesIn(inWorkspace.role)) return refused(403, VIEWER_FOLDER_REFUSAL);
	return { ok: true, workspaceId };
}

/** Whether the caller may rename or delete a folder (actions caca289e, b5d98fab); `domain` undefined is none by that id. */
export function folderChange(reach: CallerReach | null, domain: Domain | undefined): FolderVerdict {
	if (!domain || !folderVisibleTo(reach, domain)) return refused(404, FOLDER_NOT_FOUND);
	if (reach === null) return allowed;
	const role = reach.workspaces.get(domain.workspaceId ?? '')?.role;
	return writesIn(role) ? allowed : refused(403, VIEWER_FOLDER_REFUSAL);
}

/**
 * Whether the caller may put the folders in order (action a9dc11a9). The panel
 * lists the folders of every workspace the caller belongs to and the order is
 * the same for everyone, so they must reach every folder, as a writer, in each.
 */
export function folderOrdering(reach: CallerReach | null): FolderVerdict {
	if (reach === null) return allowed;
	const workspaces = [...reach.workspaces.values()];
	if (workspaces.length === 0 || workspaces.some((w) => w.folders !== null)) return refused(403, FOLDER_ORDER_REFUSAL);
	if (workspaces.some((w) => !writesIn(w.role))) return refused(403, VIEWER_FOLDER_REFUSAL);
	return allowed;
}

/**
 * Whether a project of `projectWorkspaceId` may be filed in `domain` (action
 * 7e7af191): the folder must exist in the project's own workspace (else it reads
 * as missing, rule 2dba3d12), then sit in the caller's folders there (rule 3872a8b7).
 */
export function folderForProject(
	reach: CallerReach | null,
	projectWorkspaceId: string | null,
	domain: Domain | undefined
): 'ok' | 'missing' | 'outside' {
	if (!domain) return 'missing';
	if (reach === null) return 'ok';
	if ((domain.workspaceId ?? null) !== projectWorkspaceId) return 'missing';
	const folders = foldersIn(reach, projectWorkspaceId);
	return folders === null || folders.has(domain.id) ? 'ok' : 'outside';
}
