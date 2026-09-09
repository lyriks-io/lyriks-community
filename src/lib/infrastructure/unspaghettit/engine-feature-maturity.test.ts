import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { EngineFeatureMaturityScorer } from './engine-feature-maturity.server';

/**
 * A shell whose surface never got its `rules` array. Nothing about the model is
 * missing; the collection simply is not there, which is enough for the engine's
 * scorer to throw while walking it.
 */
const shellWithoutRulesArray = {
	format: 'unspaghettit-feature',
	version: 1,
	feature: {
		id: 'feat-1',
		name: 'Publish a Zap',
		surfaces: [
			{
				id: 's1',
				name: 'Editor',
				type: 'screen',
				stateDefinitions: [
					{ path: 'zap.status', type: 'enum', enumValues: ['draft', 'on'], defaultValue: 'draft' }
				],
				actions: [
					{
						id: 'a1',
						name: 'Publish',
						intent: 'Put the Zap live.',
						roles: ['owner'],
						rules: [{ id: 'r1', category: 'business', effect: { type: 'allow_action' } }],
						effects: [{ type: 'set_state', path: 'zap.status', value: 'on' }],
						parameters: [],
						emittedEvents: [],
						requiredStates: [],
						invariants: []
					}
				]
			}
		]
	}
} as unknown as UnspaFeatureSnapshot;

describe('EngineFeatureMaturityScorer', () => {
	it('scores a shell that lost one of its collections', () => {
		// Before: the scorer threw on `surface.rules`, the throw became 0, and a
		// modelled feature read as unauthored and blocked its project.
		expect(new EngineFeatureMaturityScorer().score(shellWithoutRulesArray)).toBeGreaterThan(0);
	});

	it('reports the checks behind that score too', () => {
		const report = new EngineFeatureMaturityScorer().report(shellWithoutRulesArray);

		expect(report).not.toBeNull();
		expect(report?.maxScore).toBeGreaterThan(0);
	});

	it('still reads an absent shell as nothing to score', () => {
		const scorer = new EngineFeatureMaturityScorer();

		expect(scorer.score(null)).toBe(0);
		expect(scorer.report(null)).toBeNull();
	});
});
