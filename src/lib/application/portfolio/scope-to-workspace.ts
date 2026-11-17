import type { BackLinkRepositoryPort } from '$application/ports';

/**
 * Multi-tenant isolation filter for the flat local project store.
 *
 * The PostgreSQL catalog is a single-tenant table keyed by projectId; tenancy
 * lives in lyriks-back and is mirrored locally as `back_project_links`
 * (localProjectId → backWorkspaceId). List/search endpoints that enumerate the
 * whole catalog would otherwise expose every tenant's projects to any authenticated
 * caller. This restricts an enumeration to the caller's own workspaces.
 *
 *  - `allowedWorkspaceIds === null` → no filtering (auth-off standalone / MAP, or
 *    the single-tenant appliance): identical to the previous behaviour.
 *  - a Set → keep only projects whose back link resolves to a workspace the caller
 *    is a member of. The set must come from the identity authority (lyriks-back,
 *    token-scoped) — never from a client-settable cookie, which is forgeable.
 *    Unlinked projects (never mirrored) are excluded under scope; an empty set
 *    (caller in no workspace, or back unreachable) yields nothing — fail-closed.
 */
export async function scopeToWorkspace<T extends { readonly id: string }>(
	items: readonly T[],
	allowedWorkspaceIds: ReadonlySet<string> | null,
	backLinks: BackLinkRepositoryPort
): Promise<T[]> {
	if (allowedWorkspaceIds === null) return [...items];

	const links = await Promise.all(items.map((item) => backLinks.find(item.id)));
	return items.filter((_, i) => {
		const link = links[i];
		return link !== null && allowedWorkspaceIds.has(link.backWorkspaceId);
	});
}
