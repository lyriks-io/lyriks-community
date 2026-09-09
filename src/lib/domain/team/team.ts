/**
 * Team / collaboration domain (the Team bounded context). Mirrors the back's
 * project-collaborator model: a project runs solo or as a team, and each
 * collaborator has a **role** (permission level), **seniority** (drives manager
 * views), **expertise** (disciplines / rule families they own) and **scope**
 * (the features they're assigned to — empty = all). Pure: no transport, no UI,
 * no colors, no icons (presentation — colors AND icons — lives in
 * `$ui/team/team-style`).
 */

export const COLLABORATOR_ROLES = ['owner', 'contributor', 'reviewer', 'viewer'] as const;
export type CollaboratorRole = (typeof COLLABORATOR_ROLES)[number];

export const COLLABORATOR_SENIORITIES = ['ic', 'manager', 'executive'] as const;
export type CollaboratorSeniority = (typeof COLLABORATOR_SENIORITIES)[number];

export const COLLABORATOR_COLORS = ['violet', 'blue', 'pink', 'amber', 'mint', 'slate'] as const;
export type CollaboratorColor = (typeof COLLABORATOR_COLORS)[number];

export const ROLE_LABEL: Record<CollaboratorRole, string> = {
	owner: 'Owner',
	contributor: 'Contributor',
	reviewer: 'Reviewer',
	viewer: 'Viewer',
};
export const ROLE_HINT: Record<CollaboratorRole, string> = {
	owner: 'Full control. Cannot be removed.',
	contributor: 'Can edit any artifact; attribution tracked.',
	reviewer: 'Read + comment. No direct edits.',
	viewer: 'Read-only access.',
};

export const SENIORITY_LABEL: Record<CollaboratorSeniority, string> = {
	ic: 'IC',
	manager: 'Manager',
	executive: 'Executive',
};
export const SENIORITY_HINT: Record<CollaboratorSeniority, string> = {
	ic: 'Individual contributor',
	manager: 'Reads dashboards. Approves gates.',
	executive: 'Reads governance reports. Sets policy.',
};

export interface ExpertiseDef {
	id: string;
	label: string;
	/** Manager-tier expertise (head-of-product, cto, governance, eng-management). */
	managerTier?: boolean;
}

export const EXPERTISES: ExpertiseDef[] = [
	{ id: 'product', label: 'Product' },
	{ id: 'engineering', label: 'Engineering' },
	{ id: 'design', label: 'Design' },
	{ id: 'legal', label: 'Legal' },
	{ id: 'sales', label: 'Sales' },
	{ id: 'data', label: 'Data' },
	{ id: 'security', label: 'Security' },
	{ id: 'finance', label: 'Finance' },
	{ id: 'eng-management', label: 'Eng Mgmt', managerTier: true },
	{ id: 'head-of-product', label: 'Head Product', managerTier: true },
	{ id: 'cto', label: 'CTO', managerTier: true },
	{ id: 'governance', label: 'Governance', managerTier: true },
];

export function expertiseLabel(id: string): string {
	return EXPERTISES.find((e) => e.id === id)?.label ?? id;
}

export interface Collaborator {
	readonly id: string;
	name: string;
	email: string;
	color: CollaboratorColor;
	role: CollaboratorRole;
	seniority: CollaboratorSeniority;
	expertise: string[];
	/** Feature names this collaborator owns; empty = all features. */
	scope: string[];
	joinedAt: string;
}

/** The team for one project. */
export interface Team {
	collaborators: Collaborator[];
}

export function emptyTeam(): Team {
	return { collaborators: [] };
}

/** A project is "solo" when it has at most one collaborator. */
export function isSolo(team: Team): boolean {
	return team.collaborators.length <= 1;
}

export function teamSize(team: Team): number {
	return team.collaborators.length;
}

export function isManagerCollaborator(c: Collaborator): boolean {
	if (c.seniority === 'manager' || c.seniority === 'executive') return true;
	return c.expertise.some((e) => EXPERTISES.find((x) => x.id === e)?.managerTier);
}

/** Case-insensitive, whitespace-tolerant email match. Empty/absent on either side never matches. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
	const x = (a ?? '').trim().toLowerCase();
	const y = (b ?? '').trim().toLowerCase();
	return x.length > 0 && x === y;
}

/**
 * Whether `email` may delete the project. Once an owner is specified on the
 * team, deletion is reserved to the owner(s) — matched by email. A team with
 * no owner yet (empty team, or owner seeding failed) leaves deletion open so
 * a project can never become undeletable.
 */
export function canDeleteProject(team: Team, email: string | null | undefined): boolean {
	const owners = team.collaborators.filter((c) => c.role === 'owner');
	if (owners.length === 0) return true;
	return owners.some((c) => sameEmail(c.email, email));
}

/**
 * Whether `email` identifies a collaborator on this team — the per-project
 * visibility grant. A person "on the team" (matched by email) may see and open
 * the project even without a blanket workspace-wide view; membership in the
 * owning workspace is still required upstream (this only scopes *which* of the
 * workspace's projects a non-privileged member sees). Owner/admins bypass this
 * check entirely and are authorized before it is consulted.
 */
export function canSeeProjectAsCollaborator(team: Team, email: string | null | undefined): boolean {
	if (!email) return false;
	return team.collaborators.some((c) => sameEmail(c.email, email));
}
