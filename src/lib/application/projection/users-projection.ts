import {
	createEmptyUsersDraft,
	foldGrants,
	type OffStructureCapability,
	type PermissionGrant,
	type ProjectUsersDraft,
	type Role,
	type SuggestionDismissal
} from '$domain/users';
import { parseSuggestionDismissals } from '../specification/parse-users-draft';

/**
 * The Lyriks-owned RESIDUE for the Users section (Step 03). The behavioral half of
 * Users — the actor **personas** — already reaches the kernel via the Experience
 * projection (actor-roles → unspa personas on the `<pid>__experience` feature), so
 * this section is residue-only, like Rules: it owns the RBAC matrix (`roles`,
 * `offStructureCapabilities`, `permissions`). Derived capabilities
 * are recomputed on load from the upstream provider, never stored. Kept under section
 * "users".
 */
export interface UsersResidue {
	roles: Role[];
	offStructureCapabilities: OffStructureCapability[];
	/** One access per role and capability. Residues stored before 2026-11-02 also carry a
	    verb per line, and a `capabilityProfiles` list; both are folded away on read. */
	permissions: PermissionGrant[];
	/** Suggested personas the author removed, kept as decisions; suggestions are
	    recomputed on every load, so the history travels with the section and is
	    what an MCP reader sees (criterion `b1242208`). */
	dismissedSuggestions: SuggestionDismissal[];
	lastSavedAt: string | null;
}

/** Split the Lyriks-owned residue out of the wizard draft (the write side). */
export function usersResidueFromDraft(draft: ProjectUsersDraft): UsersResidue {
	return {
		roles: draft.roles,
		offStructureCapabilities: draft.offStructureCapabilities,
		permissions: foldGrants(draft.permissions),
		dismissedSuggestions: draft.dismissedSuggestions,
		lastSavedAt: draft.lastSavedAt
	};
}

/** Rebuild the Users wizard draft from the residue. Pure and framework-free. */
export function buildUsersProjection(
	projectId: string,
	residue: UsersResidue | null
): ProjectUsersDraft {
	const draft = createEmptyUsersDraft(projectId);
	if (!residue) return draft;
	return {
		...draft,
		roles: residue.roles,
		offStructureCapabilities: residue.offStructureCapabilities,
		// Read as accesses: lines once written per verb fold into one, so a project
		// stored before 2026-11-02 reads right with no migration (criterion 8554bd0d).
		permissions: foldGrants(residue.permissions ?? []),
		// Older residues stored bare lower-cased names, or nothing at all.
		dismissedSuggestions: parseSuggestionDismissals(residue.dismissedSuggestions),
		lastSavedAt: residue.lastSavedAt
	};
}
