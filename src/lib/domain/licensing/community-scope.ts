/**
 * What a Community installation holds (EVO-001, spec version 1): one user, one
 * project, no Evolutions, no solver. The installation applies it itself, in the
 * code, from the edition it runs: every refusal names the plan that opens what
 * it refuses, so each limit is a way up. What Solo Builder opens reads as an
 * offer: what the plan makes available, then Upgrade (EVO-006).
 */

/** A scope check: allowed, or refused with the sentence to show and the plan that opens it. */
export type ScopeCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string; readonly detail: string; readonly plan: UpgradePlan };

const ALLOWED: ScopeCheck = { ok: true };

/** The plans a locked capability leads to. */
export type UpgradePlan = 'solo_builder' | 'team' | 'enterprise';

export const UPGRADE_PLAN_NAMES: Readonly<Record<UpgradePlan, string>> = {
	solo_builder: 'Solo Builder',
	team: 'Team',
	enterprise: 'Enterprise'
};

/** Whether a value read at an edge (a refusal's JSON body) names one of the plans. */
export const isUpgradePlan = (value: unknown): value is UpgradePlan => typeof value === 'string' && Object.hasOwn(UPGRADE_PLAN_NAMES, value);

/** Where each plan is offered. */
export const PRICING_URL = 'https://lyriks.io/pricing';

/** The same address written as text, where the installation allows no link out. */
export const PRICING_ADDRESS = PRICING_URL.replace(/^https?:\/\//, '');

/** The capabilities Community locks, each with the plan that opens it. */
export const COMMUNITY_LOCKS = {
	secondProject: 'solo_builder',
	evolutions: 'solo_builder',
	sharing: 'team',
	solver: 'enterprise'
} as const satisfies Readonly<Record<string, UpgradePlan>>;

export type CommunityLock = keyof typeof COMMUNITY_LOCKS;

/** Whether the installation runs the Community edition, as it declares it. */
export const isCommunity = (edition: string | null | undefined): boolean => edition === 'community';

/** The plan that opens a capability Community locks. */
export const planOpening = (lock: CommunityLock): UpgradePlan => COMMUNITY_LOCKS[lock];

/** The one sentence a locked capability says, naming its plan. */
export function lockedSentence(lock: CommunityLock): string {
	const plan = UPGRADE_PLAN_NAMES[planOpening(lock)];
	switch (lock) {
		case 'secondProject':
			return `More active projects are available from the ${plan} plan. Upgrade to keep building.`;
		case 'evolutions':
			return `Evolutions are available from the ${plan} plan. Upgrade to keep building.`;
		case 'sharing':
			return `Community holds one user. ${plan} opens sharing with your team.`;
		case 'solver':
			return `Proving a rule for every value is part of ${plan}.`;
	}
}

/**
 * What opening an evolution from a page says on Community (New change on a
 * point of What Lyriks noticed, or on the points picked): the offer of
 * Evolutions, for this evolution (EVO-006).
 */
export function evolutionOpeningSentence(): string {
	return `Evolutions are available from the ${UPGRADE_PLAN_NAMES[planOpening('evolutions')]} plan. Upgrade to open this evolution and keep building.`;
}

/** The refusal of a capability Community locks. */
export function locked(lock: CommunityLock): ScopeCheck {
	return { ok: false, reason: lockedSentence(lock), detail: `See ${PRICING_URL}.`, plan: planOpening(lock) };
}

/**
 * A project may be created unless the installation is Community and already
 * holds one (whatever the way: the page, an AI client, an import, a copy).
 */
export function projectCreation(edition: string | null | undefined, projectCount: number): ScopeCheck {
	return isCommunity(edition) && projectCount >= 1 ? locked('secondProject') : ALLOWED;
}

/** Every Evolution operation is refused on Community. */
export function evolutionAccess(edition: string | null | undefined): ScopeCheck {
	return isCommunity(edition) ? locked('evolutions') : ALLOWED;
}

/**
 * The project a Community installation reads and writes: the one active. Only
 * an installation moved down from a paid plan holds several, all listed; the
 * others are neither read nor written until one is made active.
 */
export function activeProjectAccess(
	edition: string | null | undefined,
	input: { readonly projectId: string; readonly activeProjectId: string | null; readonly projectCount: number }
): ScopeCheck {
	const held = isCommunity(edition) && input.projectCount > 1 && input.activeProjectId !== null && input.projectId !== input.activeProjectId;
	return held
		? {
				ok: false,
				reason: 'This project is inactive: Community works on one project at a time. Make it the active project to open it.',
				detail: `${UPGRADE_PLAN_NAMES.solo_builder}, ${UPGRADE_PLAN_NAMES.team} or ${UPGRADE_PLAN_NAMES.enterprise} open every project again.`,
				plan: 'solo_builder'
			}
		: ALLOWED;
}

/**
 * The project a Community installation holds active when none was chosen yet:
 * the one saved last, so a move down keeps working on what was open.
 */
export function defaultActiveProject(projects: readonly { readonly id: string; readonly lastSavedAt: string | null }[]): string | null {
	if (projects.length === 0) return null;
	return [...projects].sort((a, b) => (b.lastSavedAt ?? '').localeCompare(a.lastSavedAt ?? ''))[0].id;
}
