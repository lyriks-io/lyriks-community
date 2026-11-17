import type { PermissionGrant } from './draft';

/** The couple a grant stands for: one role, one capability (of one source). */
export const accessKey = (g: PermissionGrant): string =>
	`${g.roleId}\u0000${g.capabilitySource}\u0000${g.capabilityId}`;

/**
 * The grants as accesses: one per role and capability, in first-seen order,
 * each reduced to its three fields (criterion 8554bd0d of feat-access-matrix).
 *
 * Grants stored before 2026-11-02 carry a verb and repeat one couple once per
 * verb; read through here they are one access each, so every existing project
 * reads right without a migration, and the next save writes them back folded.
 * Pure and idempotent.
 */
export function foldGrants(grants: readonly PermissionGrant[]): PermissionGrant[] {
	const seen = new Set<string>();
	const out: PermissionGrant[] = [];
	for (const g of grants) {
		const key = accessKey(g);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ roleId: g.roleId, capabilityId: g.capabilityId, capabilitySource: g.capabilitySource });
	}
	return out;
}
