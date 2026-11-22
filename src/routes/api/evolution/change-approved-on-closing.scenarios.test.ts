import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Record that the change was approved" (action d2d76aaf of
 * feat-26, as EVO-011 spec version 2 has them), run against the real code: the
 * approval the page sends (validate_step on the Approval, then cross_stage),
 * through POST /api/evolution and the real batch. The closing feature does not
 * model the report: the request carries one built for version 1 and closed, as
 * a request in acceptance testing does. Succeeds when the batch stands.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '10aab187';
const ACTION = 'd2d76aaf';
const walked = { 'request.stage': 'acceptance', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };
const delivered = { path: 'request.stage', operator: 'equals', value: 'delivered' } as const;

const SCENARIOS: readonly Scenario[] = [
	{ id: '09bd1274', name: 'An approved change waits for its merge', given: walked, expected: 'success', then: [delivered] },
	{ id: '93fddd6c', name: 'A cancelled request is not approved', given: { ...walked, 'request.status': 'cancelled' }, expected: 'blocked', holds: 'This request is cancelled: reopen it first.' },
	{ id: '84eb51b1', name: 'The approval fixes the commit to merge', given: { ...walked, 'code.onBranch': true }, expected: 'success', then: [delivered, { path: 'code.validated', operator: 'is_true' }] },
	{ id: '365f316d', name: 'Without a branch the approval fixes no commit', given: walked, expected: 'success', then: [{ path: 'code.validated', operator: 'is_false' }] }
];

const door = world(scene, { answers: true, applies: true });

describe('Record that the change was approved, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			const posted = await door.post(POST, [
				{ op: 'validate_step', requestId: REQUEST, step: 'approval' },
				{ op: 'cross_stage', requestId: REQUEST }
			]);
			expect(posted.ok ? 'success' : 'blocked').toBe(scenario.expected);
			const final = stateOfRequest(door.stored());
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			expect(final['request.stage']).toBe('acceptance');
			expect(posted.results.map((r) => r.summary).join(' | ')).toContain(scenario.holds);
		});
	}
});
