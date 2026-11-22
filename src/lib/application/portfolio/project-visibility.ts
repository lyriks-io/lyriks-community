import type { Team } from '$domain/team';
import { canSeeProjectAsCollaborator } from '$domain/team';

/**
 * The caller's visibility breadth over a workspace's projects, on top of plain
 * workspace membership. Two additive grant sources combine with OR:
 *
 *  - **breadth** (`allowedDomainIds`): the domain-scope baseline. `null` = blanket
 *    (owner/admin, or a member with "all projects") — sees everything. A Set =
 *    restricted to those domains (may be empty = no blanket access).
 *  - **collaborations** (`email`): explicit per-project grants from the Team dialog
 *    — a project whose collaborator team carries the caller's email is visible even
 *    when its domain is outside the breadth.
 *
 * So a restricted designer/viewer sees: their granted-domain projects PLUS the
 * specific projects they were added to. A blanket one (`allowedDomainIds === null`)
 * sees all. Enforced identically for listing (portfolio/search) and the open guard.
 */
export interface ProjectVisibility {
	/** Domain-scope baseline; null = blanket (see every project). */
	readonly allowedDomainIds: ReadonlySet<string> | null;
	/** Caller email for collaborator matching; '' or null disables per-project grants. */
	readonly email: string | null;
}

/**
 * Whether a single project is visible. `domainId` is the project's domain (may be
 * null/unassigned); `getTeam` is only consulted when the domain isn't in breadth,
 * so blanket and domain-covered projects cost no extra fetch.
 */
export async function isProjectVisible(
	projectId: string,
	domainId: string | null,
	v: ProjectVisibility,
	getTeam: (projectId: string) => Promise<Team>,
): Promise<boolean> {
	if (v.allowedDomainIds === null) return true;
	if (domainId && v.allowedDomainIds.has(domainId)) return true;
	if (!v.email) return false;
	const team = await getTeam(projectId).catch(() => null);
	return team ? canSeeProjectAsCollaborator(team, v.email) : false;
}

/** What the caller reaches in one workspace they are a member of. */
export interface WorkspaceReach {
	/** Their role there: owner, admin, designer, viewer, or a service role. */
	readonly role: string;
	/** The folders they reach there: null = every folder (owner, admin, or a member set to every project). */
	readonly folders: ReadonlySet<string> | null;
}

/**
 * Everything the caller reaches, workspace by workspace (issue 150): what a
 * member may see or do with a project or a folder is read in the workspace it
 * belongs to, never in the one the switcher shows. `null` stands for an
 * installation with nothing to scope (sign-in off, the one operator account,
 * Community), where every folder and every project is the caller's.
 */
export interface CallerReach {
	/** Every workspace the caller is a member of, by id. */
	readonly workspaces: ReadonlyMap<string, WorkspaceReach>;
	/** The workspace the switcher shows: where a new folder or project lands. Null when they belong to none. */
	readonly activeId: string | null;
	/** Their email, for the per-project grants of the Team dialog. */
	readonly email: string | null;
}

/** The roles that may write in a workspace, as the team server knows them. */
const WRITER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'designer']);

/** Whether `role` may write in its workspace (a viewer, or a service role, may not). */
export function writesIn(role: string | undefined): boolean {
	return role !== undefined && WRITER_ROLES.has(role);
}

/**
 * The folders the caller reaches in one workspace: null = every folder. Nothing
 * scoped (`reach` null) reaches everything; a workspace they are not a member
 * of, or no workspace at all under a reach, reaches nothing (fail closed).
 */
export function foldersIn(reach: CallerReach | null, workspaceId: string | null): ReadonlySet<string> | null {
	if (reach === null) return null;
	const inWorkspace = workspaceId ? reach.workspaces.get(workspaceId) : undefined;
	return inWorkspace ? inWorkspace.folders : new Set<string>();
}

/** The caller's visibility over the projects of one workspace (see `isProjectVisible`). */
export function visibilityIn(reach: CallerReach | null, workspaceId: string | null): ProjectVisibility {
	return { allowedDomainIds: foldersIn(reach, workspaceId), email: reach?.email ?? null };
}

/** The workspace ids the caller may list projects of: null = every project (nothing scoped). */
export function workspaceIdsOf(reach: CallerReach | null): ReadonlySet<string> | null {
	return reach === null ? null : new Set(reach.workspaces.keys());
}
