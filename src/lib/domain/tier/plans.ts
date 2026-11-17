import { UPGRADE_PLAN_NAMES } from '$domain/licensing';

/**
 * The four offers Lyriks is made under (EVO-001), as the account menu's Plans
 * dialog lists them, in the words of lyriks.io/pricing (which is authoritative:
 * the app follows it). Community Edition is free; Solo Builder, Team and
 * Enterprise are paid. No figure is shown here: a price written in an
 * installation would outlive a change on the plans page, which names them.
 */
export type PlanId = 'community' | 'solo-builder' | 'team' | 'enterprise';

export interface Plan {
	readonly id: PlanId;
	readonly name: string;
	/** Whether the plan is free; a paid one shows no figure and points to the plans page. */
	readonly free: boolean;
	readonly pitch: string;
	readonly includes: readonly string[];
	readonly excludes: readonly string[];
}

const BASE = 'Reverse and Knowledge';
const CHANGES = 'Changes: evolutions, impact simulation and verification';

export const PLANS: readonly Plan[] = [
	{
		id: 'community',
		name: 'Community Edition',
		free: true,
		pitch: 'Discover Lyriks on one project.',
		includes: ['1 active project (unlimited inactive)', '1 user', 'Reverse: reverse specification', 'Knowledge: knowledge base'],
		excludes: []
	},
	{
		id: 'solo-builder',
		name: UPGRADE_PLAN_NAMES.solo_builder,
		free: false,
		pitch: 'Every feature, on your own, on as many projects as you buy.',
		includes: ['1 active project per project bought', '1 user', BASE, CHANGES],
		excludes: []
	},
	{
		id: 'team',
		name: UPGRADE_PLAN_NAMES.team,
		free: false,
		pitch: 'Collaborative, end-to-end SDLC.',
		includes: ['1 active project per project bought', '5 users per project bought', BASE, CHANGES],
		excludes: []
	},
	{
		id: 'enterprise',
		name: UPGRADE_PLAN_NAMES.enterprise,
		free: false,
		pitch: 'Specific contract terms, built with us.',
		includes: ['Projects and users as per contract', 'Everything in Team', 'Dedicated CSM'],
		excludes: []
	}
];

/**
 * The paid plan a Switch to <plan> link names, or null for anything else (no
 * plan, an unknown one, Community): the activation page only speaks of a plan
 * a key can switch the installation to.
 */
export function switchTarget(id: string | null | undefined): Plan | null {
	const plan = PLANS.find((p) => p.id === id);
	return plan && !plan.free ? plan : null;
}

const BY_WORKSPACE_PLAN: Readonly<Record<string, PlanId>> = {
	'solo-builder': 'solo-builder',
	solo_builder: 'solo-builder',
	solo: 'solo-builder',
	team: 'team',
	// The name the team plan carried before it followed the plans page.
	'small-team': 'team',
	small_team: 'team',
	enterprise: 'enterprise'
};

/** The plan a workspace is on; no workspace plan, or one not known, reads Community. */
export function planOf(workspacePlan: string | null | undefined): Plan {
	const id = BY_WORKSPACE_PLAN[(workspacePlan ?? '').toLowerCase()] ?? 'community';
	return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/**
 * Whether the account menu names the plan (criterion 81cc595c): on the Community
 * edition alone, since an Enterprise customer's plan is settled by contract.
 * `edition` is what the install declares; one that declares none is not Community.
 */
export function showsPlan(edition: string | null | undefined): boolean {
	return edition === 'community';
}
