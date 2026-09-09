import type { Team } from '$domain/team/team';
import { canSeeProjectAsCollaborator } from '$domain/team/team';

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

/** Blanket visibility — sees everything (auth off, owner/admin, or "all projects"). */
export function seesEverything(v: ProjectVisibility): boolean {
	return v.allowedDomainIds === null;
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
