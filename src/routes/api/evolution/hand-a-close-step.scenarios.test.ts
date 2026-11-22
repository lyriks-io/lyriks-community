import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Hand a step of the close to my AI" (action b48c2ac4 of
 * feat-26, as EVO-011 spec version 2 has them), run against the real code: the
 * click What happens next sends (send_click, clickKind close), through POST
 * /api/evolution and the real batch. Succeeds when the step waits for the AI;
 * is refused when the door or the batch refuses it, for the scenario's own
 * reason. A validated commit lives on the request's branch: the request of
 * scenario 8ed49ca1, which names no branch, has none, so the server refuses on
 * the commit (the page offers no merge step there, rule 8245e2e6).
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '10aab187';
const ACTION = 'b48c2ac4';
const approved = { 'request.stage': 'delivered', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };
const merged = { ...approved, 'request.status': 'closed' };
const onBranch = { ...approved, 'code.onBranch': true, 'code.validated': true };
const sync = { step: 'sync' };

const SCENARIOS: readonly Scenario[] = [
	{ id: '59273699', name: 'A designer hands the merge to their AI', given: onBranch, expected: 'success', then: [{ path: 'closeStep.handed', operator: 'equals', value: 'merge' }] },
	{ id: '36f5cd03', name: 'No merge is handed before the approval', given: { ...onBranch, 'request.stage': 'acceptance' }, expected: 'blocked', holds: 'The merge is handed to the AI once the change is approved.' },
	{ id: 'edbe42ad', name: 'No merge without a validated commit', given: { ...approved, 'code.onBranch': true }, expected: 'blocked', holds: 'The merge waits for a validated commit.' },
	{ id: 'a013d603', name: 'Syncing again is handed once the change is live', given: merged, params: sync, expected: 'success', then: [{ path: 'closeStep.handed', operator: 'equals', value: 'sync' }] },
	{ id: 'da7ed59e', name: 'The branch is not deleted before the change is live', given: onBranch, params: { step: 'branch' }, expected: 'blocked', holds: 'Syncing the index again and deleting the branch come once the change is live.' },
	{ id: '8f7fb791', name: 'A step with no brief is refused', given: merged, params: { step: 'sync', brief: '' }, expected: 'blocked', holds: 'A close click needs its step (merge, sync or branch) and its brief.' },
	{ id: '77dad66b', name: 'An AI does not hand itself a step', given: { ...merged, 'session.callerKind': 'ai_client' }, params: sync, expected: 'blocked', holds: 'Only a person hands the close to their AI.' },
	// Rule ebbdbae1 says 403; the code lets a viewer through the door of the clicks a reader may send and the act refuses (422).
	{ id: '8f6d22b1', name: 'A viewer hands no step', given: { ...merged, 'session.workspaceRole': 'viewer' }, params: sync, expected: 'blocked', holds: 'Only who may edit the request hands the close to their AI.' },
	{ id: '29282cc0', name: 'Someone outside the workspace hands no step', given: { ...merged, 'session.workspaceRole': 'none' }, params: sync, expected: 'blocked', holds: '404' },
	{ id: '8ed49ca1', name: 'No merge to hand over without a branch', given: { ...approved, 'code.validated': true }, expected: 'blocked', holds: 'The merge waits for a validated commit.' }
];

const door = world(scene, { answers: true, applies: true });

describe('Hand a step of the close to my AI, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			const step = typeof state['$step'] === 'string' ? state['$step'] : 'merge';
			const brief = typeof state['$brief'] === 'string' ? state['$brief'] : 'The commands of the step';
			const posted = await door.post(POST, [{ op: 'send_click', requestId: REQUEST, clickKind: 'close', step, brief }]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			expect(final['closeStep.handed']).toBe('none');
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});
