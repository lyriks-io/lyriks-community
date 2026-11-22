import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, withLineToDecide, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Record that acceptance testing started" (action fd169aa9
 * of feat-25, as EVO-011 spec version 2 has them), run against the real code.
 * The action follows the crossing into acceptance testing, whichever makes it:
 * each scenario runs twice through POST /api/evolution and the real batch,
 * once by hand (cross_stage at Build) and once on its own (the decision that
 * settles the report). Succeeds when the request stands in acceptance testing
 * with what the scenario asserts.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '55da6501';
const ACTION = 'fd169aa9';
const built = { 'request.stage': 'implementation', 'request.frozenVersion': 1, 'report.builtForVersion': 1 };

const SCENARIOS: readonly Scenario[] = [
	{
		id: '63d8c474',
		name: 'Acceptance testing fixes no commit',
		given: { ...built, 'project.deploymentBranch': 'main', 'code.branchBound': true, 'code.validated': true },
		expected: 'success',
		then: [
			{ path: 'code.validated', operator: 'is_false' },
			{ path: 'report.closed', operator: 'is_true' }
		]
	},
	{
		id: '37a3b0b3',
		name: 'Without a branch no commit is fixed',
		given: built,
		expected: 'success',
		then: [
			{ path: 'code.validated', operator: 'is_false' },
			{ path: 'request.stage', operator: 'equals', value: 'acceptance' }
		]
	}
];

const door = world(scene, { answers: true, applies: true });

describe('Record that acceptance testing started, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			// By hand: Start acceptance testing.
			door.seed(state, requestOf(state));
			const byHand = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
			expect(byHand.ok).toBe(true);
			expect(assertionsHold(scenario, { ...stateOfRequest(door.stored()) })).toEqual([]);
			expect(door.stored().stage).toBe('acceptance');
			// On its own: the decision that settles the report.
			door.seed(state, withLineToDecide(requestOf(state)));
			const onItsOwn = await door.post(POST, [{ op: 'decide_line', requestId: REQUEST, lineId: 'trigger', decision: 'validated' }]);
			expect(onItsOwn.ok).toBe(true);
			expect(door.stored().stage).toBe('acceptance');
			expect(assertionsHold(scenario, stateOfRequest(door.stored()))).toEqual([]);
		});
	}
});
