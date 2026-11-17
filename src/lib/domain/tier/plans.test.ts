import { describe, expect, it } from 'vitest';
import { switchTarget, PLANS, planOf, showsPlan } from './plans';
import { COMMUNITY_LOCKS, UPGRADE_PLAN_NAMES } from '$domain/licensing';

describe('planOf', () => {
	it('reads the workspace plan, whatever its case', () => {
		expect(planOf('solo_builder').id).toBe('solo-builder');
		expect(planOf('Small-Team').id).toBe('team');
		expect(planOf('Enterprise').id).toBe('enterprise');
	});

	it('reads the Team plan under its name and the one it had before following the plans page', () => {
		expect(planOf('team').id).toBe('team');
		expect(planOf('small_team').id).toBe('team');
	});

	it('reads a workspace on the solo plan as Solo Builder', () => {
		expect(planOf('solo').id).toBe('solo-builder');
	});

	it('reads Community Edition without a workspace plan or with one it does not know', () => {
		for (const plan of [null, undefined, '', 'free', 'platinum']) expect(planOf(plan).id).toBe('community');
	});
});

describe('PLANS [criterion:001fd4a4]', () => {
	it('lists the four offers of lyriks.io/pricing, Community Edition first', () => {
		expect(PLANS.map((p) => p.name)).toEqual(['Community Edition', 'Solo Builder', 'Team', 'Enterprise']);
	});

	it('names every plan a Community lock leads to with the name the lock says', () => {
		const names = PLANS.map((p) => p.name);
		for (const plan of Object.values(COMMUNITY_LOCKS)) expect(names).toContain(UPGRADE_PLAN_NAMES[plan]);
	});

	it('shows no price: Community Edition is free, the paid plans point to the plans page', () => {
		expect(PLANS.filter((p) => p.free).map((p) => p.id)).toEqual(['community']);
		for (const plan of PLANS) expect(JSON.stringify(plan)).not.toMatch(/[$€£]|\d+\s*\/\s*(month|year)/i);
	});

	it('says each offer in the words of the plans page', () => {
		expect(planOf(null).pitch).toBe('Discover Lyriks on one project.');
		expect(planOf(null).includes).toEqual(['1 active project (unlimited inactive)', '1 user', 'Reverse: reverse specification', 'Knowledge: knowledge base']);
		expect(planOf('solo').includes).toEqual(['1 active project per project bought', '1 user', 'Reverse and Knowledge', 'Changes: evolutions, impact simulation and verification']);
		expect(planOf('team').pitch).toBe('Collaborative, end-to-end SDLC.');
		expect(planOf('team').includes).toContain('5 users per project bought');
		expect(planOf('enterprise').includes).toEqual(['Projects and users as per contract', 'Everything in Team', 'Dedicated CSM']);
		for (const plan of PLANS) expect(plan.excludes).toEqual([]);
	});
});

describe('showsPlan', () => {
	it('[criterion:81cc595c] names the plan on the Community edition alone', () => {
		expect(showsPlan('community')).toBe(true);
		for (const edition of ['enterprise', '', null, undefined]) expect(showsPlan(edition)).toBe(false);
	});
});

describe('switchTarget', () => {
	it('names the paid plan a Switch to link asks for', () => {
		expect(switchTarget('solo-builder')?.name).toBe('Solo Builder');
		expect(switchTarget('enterprise')?.name).toBe('Enterprise');
	});
	it('names nothing for Community, an unknown plan or none', () => {
		expect(switchTarget('community')).toBeNull();
		expect(switchTarget('platinum')).toBeNull();
		expect(switchTarget(null)).toBeNull();
	});
});
