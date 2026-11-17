import { describe, expect, it } from 'vitest';
import type { ModelCheckReport, ScenarioReport, SpecProof, VerificationVerdict } from '../ports';
import { verdictWithExploration, verificationEvidence } from './verification-evidence';

const scenarios = { total: 11, passed: 11, failed: 0 } as ScenarioReport;
const model: ModelCheckReport = { statesExplored: 2000, truncated: true, invariantViolations: [], deadActions: ['completeWorkflow'], deadlockStates: 0, unreachableSurfaces: [], terminalSurfaces: [] };

describe('verification evidence', () => {
	it('does not equate passing scenarios with exhaustive exploration or runtime tests', () => {
		const evidence = verificationEvidence(scenarios, model);
		expect(evidence).toMatchObject({ scenarioStatus: 'passed', explorationStatus: 'bounded', runtimeStatus: 'not-checked', conclusion: 'no-counterexample-within-bounds' });
		expect(evidence.unobservedActions).toEqual(['completeWorkflow']);
		expect(evidence.advisories.join(' ')).toContain('not proven unreachable');
	});
	it('does not pass empty or unavailable suites', () => {
		expect(verificationEvidence({ ...scenarios, total: 0, passed: 0 }, null).scenarioStatus).toBe('not-run');
		expect(verificationEvidence(null, null).scenarioStatus).toBe('unavailable');
	});
	it('reports actual counterexamples even when the exploration is partial', () => {
		expect(verificationEvidence(scenarios, { ...model, invariantViolations: [{ invariantName: 'safe', actionName: 'save', path: ['save'] }] }).conclusion).toBe('counterexample-found');
	});
	it('keeps actions the search did not reach apart from unobserved ones, and names them', () => {
		const unreached = Array.from({ length: 7 }, (_, i) => ({
			surfaceId: 'srf',
			actionId: `a${i}`,
			actionName: `Action ${i}`,
			reason: i === 0 ? 'exploration stopped at 2000 states (depth 4 of 6)' : ''
		}));
		const evidence = verificationEvidence(scenarios, { ...model, deadActions: [], unreachedActions: unreached });

		expect(evidence.unobservedActions).toEqual([]);
		expect(evidence.unreachedActions).toEqual(unreached);
		const advisory = evidence.advisories.find((line) => line.includes('not reached within the exploration bound'));
		expect(advisory).toContain('7 action(s)');
		expect(advisory).toContain('does not make them dead');
		expect(advisory).toContain('Action 0 (exploration stopped at 2000 states (depth 4 of 6))');
		expect(advisory).toContain('and 2 more');
		// Not reached is never a counterexample.
		expect(evidence.conclusion).toBe('no-counterexample-within-bounds');
	});
	it('says nothing about unreached actions when the engine does not tell them apart', () => {
		const evidence = verificationEvidence(scenarios, model);
		expect('unreachedActions' in evidence).toBe(false);
		expect(evidence.advisories.join(' ')).not.toContain('not reached within the exploration bound');
	});
	it('limits a complete exploration claim to the model, not the implementation', () => {
		expect(verificationEvidence(scenarios, { ...model, truncated: false })).toMatchObject({ explorationStatus: 'complete', runtimeStatus: 'not-checked' });
	});
});

describe('verdictWithExploration', () => {
	const verdict: VerificationVerdict = {
		passed: true,
		featuresChecked: 1,
		featuresPassed: 1,
		featuresFailed: 0,
		scenariosRun: 1,
		scenariosFailed: 0,
		invariantViolations: 0,
		features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: true }]
	};
	const explored = (count: number) =>
		({
			statesExplored: 4,
			truncated: false,
			invariantViolations: Array.from({ length: count }, (_, i) => ({
				invariantName: `inv ${i}`,
				actionName: 'Add to cart',
				path: ['Add to cart']
			})),
			deadActions: [],
			deadlockStates: 0,
			unreachableSurfaces: [],
			terminalSurfaces: []
		}) as ModelCheckReport;

	it('fails a passing verdict when the exploration of the same reading found a counterexample', () => {
		expect(verdictWithExploration(verdict, explored(1))).toEqual({
			...verdict,
			passed: false,
			invariantViolations: 1,
			featuresPassed: 0,
			featuresFailed: 1,
			features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false }]
		});
	});

	it('never adds again what an engine that proved the features already counted', () => {
		const counted: VerificationVerdict = {
			...verdict,
			passed: false,
			invariantViolations: 1,
			featuresPassed: 0,
			featuresFailed: 1,
			features: [{ featureId: 'feat-cart', featureName: 'Cart', passed: false }],
			solverCounted: true
		};
		const proof = {
			solver: 'ran',
			questions: 1,
			unsettled: 0,
			paths: { maxSteps: 6, results: [{ invariantId: 'i0', invariantName: 'inv 0', outcome: 'violated', steps: 1 }] }
		} as unknown as SpecProof;
		// The exploration found the same statement the engine's solver counted.
		expect(verdictWithExploration(counted, explored(1), proof)).toBe(counted);
		// A statement only the exploration found is still added.
		expect(verdictWithExploration(counted, explored(2), proof)?.invariantViolations).toBe(2);
	});

	it('leaves the verdict as it came when the exploration found nothing, or did not answer', () => {
		expect(verdictWithExploration(verdict, explored(0))).toBe(verdict);
		expect(verdictWithExploration(verdict, null)).toBe(verdict);
		expect(verdictWithExploration(null, explored(2))).toBeNull();
	});
});


describe('verification evidence: skipped actions', () => {
	const complete: ModelCheckReport = { statesExplored: 1, truncated: false, invariantViolations: [], deadActions: [], deadlockStates: 0, unreachableSurfaces: [], terminalSurfaces: [] };
	it('never calls an exploration complete when it skipped an action, and names it', () => {
		const evidence = verificationEvidence(scenarios, {
			...complete,
			skippedActions: [{ surfaceId: 'srf', actionId: 'a1', actionName: 'Top up', reason: 'required number parameter "amount" has no default' }]
		});
		expect(evidence.explorationStatus).toBe('bounded');
		expect(evidence.skippedActions).toHaveLength(1);
		expect(evidence.advisories.join(' ')).toContain('never run by the exploration');
		expect(evidence.advisories.join(' ')).toContain('Top up');
	});
	it('still calls a search with nothing skipped complete', () => {
		expect(verificationEvidence(scenarios, { ...complete, skippedActions: [] }).explorationStatus).toBe('complete');
	});
});

describe('the verdict of one reading counts the paths the solver found', () => {
	const passing: VerificationVerdict = {
		passed: true,
		featuresChecked: 1,
		featuresPassed: 1,
		featuresFailed: 0,
		scenariosRun: 5,
		scenariosFailed: 0,
		invariantViolations: 0,
		features: [{ featureId: 'feat-loyalty', featureName: 'Loyalty', passed: true }]
	};
	const quiet = { statesExplored: 7, truncated: true, invariantViolations: [], deadActions: [], deadlockStates: 0, unreachableSurfaces: [], terminalSurfaces: [] } as ModelCheckReport;
	const proof = (outcomes: Record<string, 'violated' | 'none-within-bound'>) => ({
		solver: 'ran' as const,
		questions: 25,
		unsettled: 0,
		paths: {
			maxSteps: 6,
			results: Object.entries(outcomes).map(([invariantName, outcome]) => ({ invariantId: invariantName, invariantName, outcome }))
		},
		leads: []
	});

	it('fails a verdict whose solver found a path from the start', () => {
		const verdict = verdictWithExploration(passing, quiet, proof({ 'Gold keeps a floor': 'violated', 'Points never negative': 'none-within-bound' }));
		expect(verdict).toMatchObject({ passed: false, invariantViolations: 1, featuresFailed: 1 });
	});

	it('counts a statement broken by both the exploration and the solver once', () => {
		const both = { ...quiet, invariantViolations: [{ invariantName: 'Gold keeps a floor', actionName: 'Redeem', path: ['Earn', 'Upgrade', 'Redeem'] }] };
		expect(verdictWithExploration(passing, both, proof({ 'Gold keeps a floor': 'violated' }))?.invariantViolations).toBe(1);
	});

	it('leaves a verdict alone when no path was found', () => {
		expect(verdictWithExploration(passing, quiet, proof({ 'Points never negative': 'none-within-bound' }))).toBe(passing);
	});
});

describe('verification evidence: the solver instead of the exploration', () => {
	it('takes the solver search as the evidence, bounded by its steps', () => {
		const evidence = verificationEvidence(scenarios, null, {
			solver: 'ran',
			questions: 9,
			unsettled: 0,
			paths: { maxSteps: 6, results: [{ invariantId: 'i1', invariantName: 'Floor', outcome: 'violated', steps: 3 }] },
			actions: { maxSteps: 6, results: [{ actionId: 'a1', actionName: 'Freeze', outcome: 'none-within-bound' }] },
			leads: []
		});
		expect(evidence).toMatchObject({ explorationStatus: 'solver', conclusion: 'counterexample-found', unobservedActions: ['Freeze'] });
		expect(evidence.advisories.join(' ')).toContain('the exploration was not run; nothing is proven beyond those steps');
	});
});
