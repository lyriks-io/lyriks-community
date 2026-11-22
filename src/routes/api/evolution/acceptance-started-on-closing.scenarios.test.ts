import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, withLineToDecide, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenario of "Record that acceptance testing started" (action 898723e2
 * of feat-26, as EVO-011 spec version 2 has it), run against the real code.
 * The closing feature does not model the report: the crossing it follows
 * needs one settled, so the request carries a report built for version 1.
 * It runs twice through POST /api/evolution and the real batch, once by hand
 * (cross_stage at Build) and once on its own (the decision that settles the
 * report).
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '10aab187';
const ACTION = '898723e2';

const SCENARIOS: readonly Scenario[] = [
	{
		id: 'a3ee7243',
		name: 'Acceptance testing fixes no commit to merge',
		given: { 'request.stage': 'implementation', 'code.onBranch': true, 'code.validated': true, 'request.frozenVersion': 1, 'report.builtForVersion': 1 },
		expected: 'success',
		then: [{ path: 'code.validated', operator: 'is_false' }]
	}
];

const door = world(scene, { answers: true, applies: true });

describe('Record that acceptance testing started (closing), through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			expect((await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }])).ok).toBe(true);
			expect(door.stored().stage).toBe('acceptance');
			expect(assertionsHold(scenario, stateOfRequest(door.stored()))).toEqual([]);
			door.seed(state, withLineToDecide(requestOf(state)));
			expect((await door.post(POST, [{ op: 'decide_line', requestId: REQUEST, lineId: 'trigger', decision: 'validated' }])).ok).toBe(true);
			expect(door.stored().stage).toBe('acceptance');
			expect(assertionsHold(scenario, stateOfRequest(door.stored()))).toEqual([]);
		});
	}
});
