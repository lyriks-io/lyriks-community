import {
	createEmptyUsersDraft,
	type CapabilityProfile,
	type OffStructureCapability,
	type PermissionGrant,
	type ProjectUsersDraft,
	type Role
} from '$domain/users';

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
	permissions: PermissionGrant[];
	/** Per-row typing (kind + verb list). Authored, sparse, never derived. */
	capabilityProfiles: CapabilityProfile[];
	lastSavedAt: string | null;
}

/** Split the Lyriks-owned residue out of the wizard draft (the write side). */
export function usersResidueFromDraft(draft: ProjectUsersDraft): UsersResidue {
	return {
		roles: draft.roles,
		offStructureCapabilities: draft.offStructureCapabilities,
		permissions: draft.permissions,
		capabilityProfiles: draft.capabilityProfiles,
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
		permissions: residue.permissions,
		// Projects saved before row typing existed carry no profiles — they fall
		// back to the source defaults rather than losing their verb lists.
		capabilityProfiles: residue.capabilityProfiles ?? [],
		lastSavedAt: residue.lastSavedAt
	};
}
