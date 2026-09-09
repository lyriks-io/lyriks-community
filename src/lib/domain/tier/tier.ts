/**
 * Product tier, as the install's workspace plan names it.
 *
 * - oss        : Community, one operator, the whole specification workspace.
 * - enterprise : team access and formal verification, served by the Enterprise
 *                overlay; the open-source tree only knows the name.
 */
export type Tier = 'oss' | 'enterprise';

const RANK: Record<Tier, number> = { oss: 0, enterprise: 1 };

/** Map a workspace `plan` to a tier: `enterprise` and `team` are Enterprise, anything else is Community. */
export function tierFromPlan(plan: string | null | undefined): Tier {
	switch ((plan ?? '').toLowerCase()) {
		case 'enterprise':
		case 'team':
			return 'enterprise';
		default:
			return 'oss';
	}
}

/** Does the current tier satisfy the minimum required tier? */
export function tierAllows(current: Tier, required: Tier): boolean {
	return RANK[current] >= RANK[required];
}

/** Formal verification is an Enterprise entitlement. */
export function tierHasFormalDpo(tier: Tier): boolean {
	return tier === 'enterprise';
}

/** Community stays single-operator; Enterprise enables member management. */
export function tierAllowsMultipleMembers(tier: Tier): boolean {
	return tier === 'enterprise';
}

/** Human label for a tier (badges, locked capabilities). */
export function tierLabel(tier: Tier): string {
	return tier === 'enterprise' ? 'Enterprise' : 'Community';
}
