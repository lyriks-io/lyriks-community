import { describe, it, expect } from 'vitest';
import { planNextTrl } from './trl-plan';

/** The legacy 1-9 ladder (the `$ui/design-system` stage helpers build on it). */
const trlOf = (score: number) => Math.max(1, Math.min(9, Math.round((score / 100) * 9)));

const checks = (n: number) => Array.from({ length: n }, (_, i) => `check ${i + 1}`);

describe('planNextTrl', () => {
	it('names the smallest number of checks that moves the badge up', () => {
		// 10 checks, 5 passed: 50% maps to TRL 5, 60% (6 passed) to TRL 5 as well,
		// 70% (7 passed) to TRL 6. So the next level is two checks away.
		const plan = planNextTrl({ score: 5, maxScore: 10, issues: checks(5) }, trlOf);
		expect(plan.currentLevel).toBe(5);
		expect(plan.nextLevel).toBe(6);
		expect(plan.checksToNextLevel).toBe(2);
		expect(plan.nextSteps).toEqual(['check 1', 'check 2']);
		expect(plan.laterSteps).toEqual(['check 3', 'check 4', 'check 5']);
	});

	it('reports the level actually reached when one check jumps two rungs', () => {
		// 2 checks, 1 passed: 50% is TRL 5, and the last one takes it straight to 9.
		const plan = planNextTrl({ score: 1, maxScore: 2, issues: checks(1) }, trlOf);
		expect(plan.currentLevel).toBe(5);
		expect(plan.nextLevel).toBe(9);
		expect(plan.checksToNextLevel).toBe(1);
	});

	it('has nothing to plan once every check passes', () => {
		const plan = planNextTrl({ score: 10, maxScore: 10, issues: [] }, trlOf);
		expect(plan.currentLevel).toBe(9);
		expect(plan.nextLevel).toBeNull();
		expect(plan.checksToNextLevel).toBe(0);
		expect(plan.nextSteps).toEqual([]);
	});

	it('keeps the failed checks as later steps when none of them moves the level', () => {
		// A ladder frozen at one level: no amount of passing changes the badge, so
		// the debt is still shown, just never sold as "the way up".
		const frozen = () => 4;
		const plan = planNextTrl({ score: 1, maxScore: 4, issues: checks(3) }, frozen);
		expect(plan.nextLevel).toBeNull();
		expect(plan.laterSteps).toHaveLength(3);
	});

	it('survives a feature with no applicable check', () => {
		const plan = planNextTrl({ score: 0, maxScore: 0, issues: [] }, trlOf);
		expect(plan.currentLevel).toBe(9);
		expect(plan.nextLevel).toBeNull();
	});

	it('flags a floored reading, where the checks do not explain the missing points', () => {
		// The engine holds a surface-less feature at 0 out of 2 while naming only
		// "add a surface". Passing that one check does not take it to 50%, so the
		// plan must not be read as a level promise.
		const plan = planNextTrl({ score: 0, maxScore: 2, issues: ['add a surface'] }, trlOf);
		expect(plan.exhaustive).toBe(false);
		expect(plan.nextSteps).toEqual(['add a surface']);
	});

	it('is exhaustive when every missing point has a named check behind it', () => {
		const plan = planNextTrl({ score: 5, maxScore: 10, issues: checks(5) }, trlOf);
		expect(plan.exhaustive).toBe(true);
	});

	it('never slices past the issue list when a check outweighs one point', () => {
		// Defensive: weights are all 1 today, but a weighted check would make the
		// gap wider than the number of issues behind it.
		const plan = planNextTrl({ score: 5, maxScore: 10, issues: checks(1) }, trlOf);
		expect(plan.checksToNextLevel).toBe(2);
		expect(plan.nextSteps).toEqual(['check 1']);
		expect(plan.laterSteps).toEqual([]);
	});
});
