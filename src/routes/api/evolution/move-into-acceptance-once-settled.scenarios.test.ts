import { describe, expect, it, vi } from 'vitest';
import { buildGate } from '$domain/evolution';
import { REQUEST, assertionsHold, deploymentBranchOf, requestOf, stateOf, stateOfRequest, withLineToDecide, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Move into acceptance testing once the Build is settled"
 * (action 4153ad9e of feat-35, as EVO-011 spec version 2 has them), run
 * against the real code: a person decides the line that settles the report,
 * through POST /api/evolution and the real batch, which moves the request into
 * Approval in the same act or leaves it in Build. Succeeds when the request
 * stands in acceptance testing afterwards; is refused when it does not.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = '4153ad9e';
const building = { 'request.stage': 'implementation', 'request.frozenVersion': 1, 'report.builtForVersion': 1 };
const onBranch = { ...building, 'project.deploymentBranchNamed': true, 'code.branchBound': true };

const SCENARIOS: readonly Scenario[] = [
	{
		id: 'dcfc72c3',
		name: 'A settled report moves the request into acceptance testing',
		given: onBranch,
		expected: 'success',
		then: [
			{ path: 'request.stage', operator: 'equals', value: 'acceptance' },
			{ path: 'report.closed', operator: 'is_true' },
			{ path: 'code.validated', operator: 'is_false' }
		]
	},
	{ id: '843f146e', name: 'A line still to decide holds the Build', given: { ...building, 'report.linesToDecide': 1 }, expected: 'blocked', holds: 'Lines of this report are still undecided.' },
	{ id: 'b5edddac', name: 'A line sent back holds the Build', given: { ...building, 'report.sentBack': 1 }, expected: 'blocked', holds: 'Lines were sent back to the build.' },
	{ id: 'eb8e8ca6', name: 'An adoption waiting for its check holds the Build', given: { ...building, 'report.adoptionAwaitsCheck': true }, expected: 'blocked', holds: 'An adoption amended the spec.' },
	{ id: 'e00ff25a', name: 'Uncommitted code holds the Build', given: { ...onBranch, 'code.uncommitted': true }, expected: 'blocked', holds: 'The branch holds uncommitted code' },
	{ id: 'fbd907fd', name: 'Proofs taken on another commit hold the Build', given: { ...onBranch, 'code.proofsOnOtherCommits': 2 }, expected: 'blocked', holds: '2 proofs were taken on another commit' }
];

const door = world(scene, { answers: true, applies: true });

describe('Move into acceptance testing once the Build is settled, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, withLineToDecide(requestOf(state)));
			const posted = await door.post(POST, [{ op: 'decide_line', requestId: REQUEST, lineId: 'trigger', decision: 'validated' }]);
			// The decision itself always stands: a move that does not follow is never a refusal of the act.
			expect(posted.ok).toBe(true);
			const stored = door.stored();
			const final = stateOfRequest(stored);
			expect(final['request.stage'] === 'acceptance' ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				// Moved by the settled report, naming no person, and said as such.
				expect(posted.results.map((r) => r.summary)).toContain('Automatic: Verification closed: the evolution moves to acceptance testing');
			} else {
				expect(final['request.stage']).toBe('implementation');
				// Held by the gate cross_stage into acceptance reads, on the scenario's own rule.
				const gate = buildGate(stored, deploymentBranchOf(state));
				expect(gate.ok ? '' : gate.reason).toContain(scenario.holds);
			}
		});
	}
});
