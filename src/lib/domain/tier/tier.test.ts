import { describe, expect, it } from 'vitest';
import {
	tierAllows,
	tierAllowsMultipleMembers,
	tierFromPlan,
	tierHasFormalDpo,
	tierLabel
} from './tier';

describe('edition policy', () => {
	it('keeps Community single-member and without formal verification', () => {
		const tier = tierFromPlan('free');
		expect(tier).toBe('oss');
		expect(tierAllowsMultipleMembers(tier)).toBe(false);
		expect(tierHasFormalDpo(tier)).toBe(false);
		expect(tierLabel(tier)).toBe('Community');
	});

	it('reads any plan that is not an Enterprise one as Community', () => {
		for (const plan of ['solo', 'paid', 'unknown', '', null, undefined]) {
			expect(tierFromPlan(plan)).toBe('oss');
		}
	});

	it('enables multi-member workspaces and formal verification only for Enterprise plans', () => {
		for (const plan of ['team', 'enterprise', 'Enterprise']) {
			const tier = tierFromPlan(plan);
			expect(tier).toBe('enterprise');
			expect(tierAllowsMultipleMembers(tier)).toBe(true);
			expect(tierHasFormalDpo(tier)).toBe(true);
			expect(tierAllows(tier, 'oss')).toBe(true);
			expect(tierAllows('oss', tier)).toBe(false);
		}
	});
});
