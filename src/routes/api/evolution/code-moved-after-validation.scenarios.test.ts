import { describe, expect, it, vi } from 'vitest';
import { BRANCH, REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Record that the code moved after the validation" (action
 * bbbcee9b of feat-35, as EVO-011 spec version 2 has them), run against the
 * real code: the AI reports the branch with a new commit of code
 * (report_code_state), through POST /api/evolution and the real batch.
 * Succeeds when the approval stands set aside afterwards; is refused when
 * nothing is set aside.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = 'bbbcee9b';

const SCENARIOS: readonly Scenario[] = [
	{
		id: 'd9ff3d31',
		name: 'New code sets the approval aside and asks for it again',
		given: {
			'request.stage': 'delivered',
			'request.frozenVersion': 1,
			'report.builtForVersion': 1,
			'report.closed': true,
			'project.deploymentBranchNamed': true,
			'code.branchBound': true,
			'code.validated': true,
			'approval.mine': true
		},
		expected: 'success',
		then: [
			{ path: 'code.validationSetAside', operator: 'is_true' },
			{ path: 'request.stage', operator: 'equals', value: 'acceptance' },
			{ path: 'approval.mine', operator: 'is_false' }
		]
	},
	{ id: 'be51756f', name: 'Nothing is set aside without a validation', given: { 'request.stage': 'specification' }, expected: 'blocked' }
];

const door = world(scene, { answers: true, applies: true });

describe('Record that the code moved after the validation, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			// The index sync of the AI reports the branch with a commit of code after the validated one.
			const posted = await door.post(POST, [
				{ op: 'report_code_state', requestId: REQUEST, branch: BRANCH, baseCommit: 'b45e0000aaaa', head: 'aaaa0020cccc', codeHead: 'c0de0020dddd', clean: true, proofsChecked: 4, proofsOnOtherCommits: 0 }
			]);
			const stored = door.stored();
			const final = stateOfRequest(stored);
			expect(final['code.validationSetAside'] === true ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(posted.ok).toBe(true);
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			// No approval to set aside: nothing reads set aside, whatever the report did.
			expect(final['code.validated']).toBe(false);
		});
	}
});
