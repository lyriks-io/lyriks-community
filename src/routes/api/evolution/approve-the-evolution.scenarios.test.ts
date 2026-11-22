import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Approve the evolution" (action 19a4e481 of feat-35, as
 * EVO-011 spec version 2 has them), run against the real code: the batch the
 * page sends, validate_step on the Approval and, when that approval is the last
 * one awaited, cross_stage, through POST /api/evolution and the real batch.
 * Succeeds when the batch stands; is refused when the door or the batch
 * refuses it, for the scenario's own reason.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = '19a4e481';
const walked = { 'request.stage': 'acceptance', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };
const bound = { ...walked, 'project.deploymentBranchNamed': true, 'code.branchBound': true };
const ai = { 'session.callerKind': 'ai_client' };
const delivered = { path: 'request.stage', operator: 'equals', value: 'delivered' } as const;
const stays = { path: 'request.stage', operator: 'equals', value: 'acceptance' } as const;

const SCENARIOS: readonly Scenario[] = [
	{ id: '64e108d0', name: 'The only approval awaited moves the change into Deployment', given: walked, expected: 'success', then: [delivered, { path: 'approval.mine', operator: 'is_true' }] },
	{ id: '9b2cb16b', name: 'An approval waits for the others named', given: { ...walked, 'approval.othersAwaited': 2 }, expected: 'success', then: [stays, { path: 'approval.mine', operator: 'is_true' }] },
	{ id: 'eceec63c', name: 'A remark not written back holds the approval', given: { ...walked, 'acceptance.remarksToWriteBack': 1 }, expected: 'blocked', holds: 'An accepted observation has not been written back into the spec yet.' },
	{ id: 'd2e4ad93', name: 'A person approves only once', given: { ...walked, 'approval.mine': true, 'approval.othersAwaited': 1 }, expected: 'blocked', holds: 'You already validated this step.' },
	{ id: '3cb90dd3', name: 'A delegated AI does not approve', given: { ...walked, ...ai, 'ai.delegated': true, 'workspace.singleMember': true }, expected: 'blocked', holds: "Approving the delivery stays a person's decision." },
	{ id: '840fdc88', name: 'An AI does not approve in a team', given: { ...walked, ...ai }, expected: 'blocked', holds: 'An AI client cannot validate a step.' },
	{ id: '87283f0e', name: 'An AI approves for a person alone in the workspace', given: { ...walked, ...ai, 'workspace.singleMember': true }, expected: 'success', then: [delivered] },
	{ id: 'a713aa37', name: 'A cancelled request is not approved', given: { ...walked, 'request.status': 'cancelled' }, expected: 'blocked', holds: 'This request is cancelled: reopen it first.' },
	{ id: 'c2ad3f41', name: 'A viewer does not approve', given: { ...walked, 'session.workspaceRole': 'viewer' }, expected: 'blocked', holds: '403' },
	{ id: '4752de9a', name: 'Someone outside the workspace does not approve', given: { ...walked, 'session.workspaceRole': 'none' }, expected: 'blocked', holds: '404' },
	{
		id: 'db6065d1',
		name: 'The last approval fixes the commit of the branch',
		given: { ...bound, 'code.validationSetAside': true },
		expected: 'success',
		then: [delivered, { path: 'code.validated', operator: 'is_true' }, { path: 'code.validationSetAside', operator: 'is_false' }]
	},
	{ id: '6432b423', name: 'An approval others still await fixes no commit', given: { ...bound, 'approval.othersAwaited': 1 }, expected: 'success', then: [stays, { path: 'code.validated', operator: 'is_false' }] }
];

const door = world(scene, { answers: true, applies: true });

describe('Approve the evolution, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			// The page's batch: the approval, and the crossing it completes when nobody else is awaited.
			const completes = state['approval.othersAwaited'] === 0;
			const posted = await door.post(POST, [{ op: 'validate_step', requestId: REQUEST, step: 'approval' }, ...(completes ? [{ op: 'cross_stage', requestId: REQUEST }] : [])]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			// Refused, nothing approved and the request left in acceptance testing, for the scenario's own reason.
			expect(final['request.stage']).toBe('acceptance');
			expect(final['approval.mine']).toBe(state['approval.mine']);
			expect(posted.results.map((r) => r.summary).join(' | ') || String(posted.status)).toContain(scenario.holds);
		});
	}
});
