import { describe, expect, it } from 'vitest';
import type { SpecProof } from '../ports';
import { explorationPlan } from './exploration-fallback';

const settled: SpecProof = {
	solver: 'ran',
	questions: 20,
	unsettled: 0,
	paths: { maxSteps: 6, results: [{ invariantId: 'i1', invariantName: 'Balance never negative', outcome: 'violated', steps: 1 }] },
	actions: { maxSteps: 6, results: [{ actionId: 'a1', actionName: 'Withdraw', outcome: 'reached', steps: 1 }] },
	goals: { maxSteps: 6, results: [{ goalId: 'g1', goalName: 'Frozen', outcome: 'none-within-bound' }] },
	deadlocks: { maxSteps: 6, outcome: 'none-within-bound' },
	leads: []
};

describe('explorationPlan', () => {
	it('skips the exploration when the solver settled every statement, action, goal and dead end', () => {
		expect(explorationPlan(settled)).toEqual({
			run: false,
			reasons: ['the solver settled every statement, action, goal and dead end within 6 steps']
		});
	});

	it('runs it when the dead-end search was left open, or not made by an older engine', () => {
		expect(explorationPlan({ ...settled, deadlocks: { maxSteps: 6, outcome: 'unsupported', reason: 'the feature has no action' } })).toEqual({
			run: true,
			reasons: ['the search for dead ends left open']
		});
		const { deadlocks: _deadlocks, ...withoutDeadEnds } = settled;
		expect(explorationPlan(withoutDeadEnds).run).toBe(true);
	});

	it('runs it where the solver left something open, and says what', () => {
		const open: SpecProof = {
			...settled,
			paths: { maxSteps: 6, results: [{ invariantId: 'i2', invariantName: 'Sum of lines', outcome: 'unsupported', reason: 'it reads a sum over a list' }] },
			goals: { maxSteps: 6, results: [{ goalId: 'g2', goalName: 'Always back', outcome: 'unsupported' }, { goalId: 'g3', goalName: 'Rich', outcome: 'unsettled' }] }
		};
		expect(explorationPlan(open)).toEqual({
			run: true,
			reasons: ['1 statement the solver left open', '2 goals the solver left open']
		});
	});

	it('runs it without a proof, a solver, a whole proof or a reach search', () => {
		expect(explorationPlan(null).run).toBe(true);
		expect(explorationPlan({ ...settled, solver: 'unavailable' }).run).toBe(true);
		expect(explorationPlan({ ...settled, interrupted: 'a question never answered' }).run).toBe(true);
		const { actions: _actions, ...olderEngine } = settled;
		expect(explorationPlan(olderEngine).run).toBe(true);
	});
});
