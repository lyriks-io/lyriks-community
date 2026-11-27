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
	| {
			readonly ok: false;
			readonly reason: string;
			readonly detail: string;
			/** The plan that opens it; null when a key with more projects does, not a plan (EVO-016). */
			readonly plan: UpgradePlan | null;
	  };

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
 * The number of active projects this installation holds (EVO-016): 1 on
 * Community, the number the key in force states on Enterprise, null (every
 * project) for an Enterprise key that states none or an installation that
 * declares no edition.
 */
export function projectsInForce(edition: string | null | undefined, keyProjects: number | null): number | null {
	if (isCommunity(edition)) return 1;
	return typeof keyProjects === 'number' && Number.isInteger(keyProjects) && keyProjects >= 1 ? keyProjects : null;
}

const activeProjects = (n: number): string => `${n} active project${n === 1 ? '' : 's'}`;

/** What an Enterprise installation says when its key holds no more projects (EVO-016, criterion ff8aad5f). */
export function projectLimitSentence(granted: number): string {
	return `This installation's licence holds ${activeProjects(granted)}. Ask for a key with more projects to keep building.`;
}

/**
 * A project may be created unless the installation already holds as many as
 * its key grants (whatever the way: the page, an AI client, an import, a copy):
 * Community holds one and offers Solo Builder; an Enterprise key that states N
 * holds N and asks for a key with more projects (EVO-016).
 */
export function projectCreation(edition: string | null | undefined, projectCount: number, keyProjects: number | null = null): ScopeCheck {
	if (isCommunity(edition)) return projectCount >= 1 ? locked('secondProject') : ALLOWED;
	const granted = projectsInForce(edition, keyProjects);
	if (granted === null || projectCount < granted) return ALLOWED;
	return { ok: false, reason: projectLimitSentence(granted), detail: '', plan: null };
}

/** Every Evolution operation is refused on Community. */
export function evolutionAccess(edition: string | null | undefined): ScopeCheck {
	return isCommunity(edition) ? locked('evolutions') : ALLOWED;
}

/**
 * The projects an installation reads and writes: the ones active. An
 * installation holds more projects than its key grants only once a key with
 * fewer arrived (a move down from a paid plan, or a smaller Enterprise key):
 * all stay listed, and the others are neither read nor written until one is
 * made active. Community holds one; an Enterprise key that states N, N (EVO-016).
 */
export function activeProjectAccess(
	edition: string | null | undefined,
	input: {
		readonly projectId: string;
		readonly activeProjectIds: readonly string[];
		readonly projectCount: number;
		readonly granted: number | null;
	}
): ScopeCheck {
	const { granted } = input;
	const held =
		granted !== null && input.projectCount > granted && input.activeProjectIds.length > 0 && !input.activeProjectIds.includes(input.projectId);
	if (!held) return ALLOWED;
	if (isCommunity(edition))
		return {
			ok: false,
			reason: 'This project is inactive: Community works on one project at a time. Make it the active project to open it.',
			detail: `${UPGRADE_PLAN_NAMES.solo_builder}, ${UPGRADE_PLAN_NAMES.team} or ${UPGRADE_PLAN_NAMES.enterprise} open every project again.`,
			plan: 'solo_builder'
		};
	return {
		ok: false,
		reason:
			granted === 1
				? `This project is inactive: this installation's licence holds ${activeProjects(granted)}. Make it the active project to open it.`
				: `This project is inactive: this installation's licence holds ${activeProjects(granted)}. Make it an active project to open it.`,
		detail: 'A key with more projects opens it beside the others.',
		plan: null
	};
}

/**
 * The projects an installation holds active when nobody chose them: the N
 * saved last, so a move down keeps working on what was open (EVO-016,
 * criterion abf6f54e).
 */
export function defaultActiveProjects(
	projects: readonly { readonly id: string; readonly lastSavedAt: string | null }[],
	granted: number
): string[] {
	return [...projects]
		.sort((a, b) => (b.lastSavedAt ?? '').localeCompare(a.lastSavedAt ?? ''))
		.slice(0, Math.max(0, granted))
		.map((p) => p.id);
}

/** The one project a Community installation holds active when none was chosen yet: the one saved last. */
export function defaultActiveProject(projects: readonly { readonly id: string; readonly lastSavedAt: string | null }[]): string | null {
	return defaultActiveProjects(projects, 1)[0] ?? null;
}

/**
 * The projects active now: the ones chosen that still exist, most recently
 * chosen first and never more than the key grants, completed by the ones
 * saved last when fewer were chosen.
 */
export function resolveActiveProjects(
	projects: readonly { readonly id: string; readonly lastSavedAt: string | null }[],
	chosen: readonly string[],
	granted: number
): string[] {
	const exists = new Set(projects.map((p) => p.id));
	const kept = [...new Set(chosen)].filter((id) => exists.has(id)).slice(0, granted);
	if (kept.length >= granted) return kept;
	const rest = projects.filter((p) => !kept.includes(p.id));
	return [...kept, ...defaultActiveProjects(rest, granted - kept.length)];
}
