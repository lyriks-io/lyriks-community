import { describe, expect, it } from 'vitest';
import type { ModelCheckReport, ScenarioReport } from './ports';
import { verificationEvidence } from './verification-evidence';

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
