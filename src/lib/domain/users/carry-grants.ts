import type { PermissionGrant } from './draft';
import type { CapabilitySource } from './enums';
import { foldGrants } from './fold-grants';

/** A row of the matrix as the carry-over needs it: what it is and whom it belongs to. */
export interface GrantRow {
	readonly id: string;
	readonly source: CapabilitySource;
	/** For an action row: the feature that declares it. */
	readonly featureId?: string;
}

/**
 * Carry grants authored before the matrix was per action onto the rows it now
 * shows, so changing the granularity never takes away what a role could reach
 * (criterion e81345e6): a grant on a whole feature that now has action rows
 * becomes access to each of its actions. The result is folded, one access per
 * role and capability, so grants once written per verb read as one.
 *
 * Pure and idempotent. Grants on rows that do not exist are left as they are:
 * dropping dead grants is the save's job, and it names what it drops.
 */
export function carryGrantsToRows(
	permissions: readonly PermissionGrant[],
	rows: readonly GrantRow[]
): PermissionGrant[] {
	const rowIds = new Set(rows.map((r) => r.id));
	const actionsByFeature = new Map<string, GrantRow[]>();
	for (const row of rows) {
		if (!row.featureId) continue;
		const list = actionsByFeature.get(row.featureId) ?? [];
		list.push(row);
		actionsByFeature.set(row.featureId, list);
	}
	return foldGrants(
		permissions.flatMap((grant) => {
			const featureActions = rowIds.has(grant.capabilityId) ? undefined : actionsByFeature.get(grant.capabilityId);
			return featureActions?.length
				? featureActions.map((row) => ({ roleId: grant.roleId, capabilityId: row.id, capabilitySource: row.source }))
				: [grant];
		})
	);
}
