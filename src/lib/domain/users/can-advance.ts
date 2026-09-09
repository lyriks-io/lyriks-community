import { SYSTEM_CAPABILITIES } from './enums';
import { hasGrant, type ProjectUsersDraft } from './draft';

/**
 * Minimum bar to unlock Step 04: ≥ 1 role, every System capability granted
 * to ≥ 1 role. Mirrors the feature invariant on `33b2f79d`.
 */
export function usersCanAdvance(draft: ProjectUsersDraft): boolean {
	return missingUsersRequirements(draft).length === 0;
}

export function missingUsersRequirements(draft: ProjectUsersDraft): string[] {
	const missing: string[] = [];
	if (draft.roles.length === 0) missing.push('one role');
	else {
		const ungranted = SYSTEM_CAPABILITIES.filter(
			(sys) => !draft.roles.some((r) => hasGrant(draft.permissions, r.id, sys.id))
		);
		if (ungranted.length > 0) {
			missing.push(`grants for: ${ungranted.map((c) => c.label).join(', ')}`);
		}
	}
	return missing;
}
