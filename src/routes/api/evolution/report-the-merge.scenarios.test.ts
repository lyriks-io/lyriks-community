import { describe, expect, it, vi } from 'vitest';
import { BRANCH, REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Report the merge" (action a4656683 of feat-35, as EVO-011
 * spec version 2 has them), run against the real code: the merge git reports
 * (report_merge, as report-merge.mjs sends it), through POST /api/evolution
 * and the real batch. Succeeds when the merge is recorded and the request
 * closed; is refused when the door or the batch refuses it, for the
 * scenario's own reason, nothing recorded.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = 'a4656683';
const approved = { 'request.stage': 'delivered', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };
const validated = { ...approved, 'project.deploymentBranchNamed': true, 'code.branchBound': true, 'code.validated': true };

const SCENARIOS: readonly Scenario[] = [
	{
		id: 'd7a2e4db',
		name: 'The merge of the validated commit declares the change live',
		given: validated,
		expected: 'success',
		then: [
			{ path: 'code.merged', operator: 'is_true' },
			{ path: 'request.status', operator: 'equals', value: 'closed' },
			{ path: 'request.landed', operator: 'is_true' }
		]
	},
	{ id: '56bdbcd3', name: 'No merge without a deployment branch', given: approved, expected: 'blocked', holds: 'The project names no deployment branch.' },
	{ id: '2c81b284', name: 'No merge before the approval', given: { ...validated, 'request.stage': 'acceptance' }, expected: 'blocked', holds: 'The merge comes once the change is approved.' },
	{ id: '26f65205', name: 'No merge without a validated commit', given: { ...approved, 'project.deploymentBranchNamed': true }, expected: 'blocked', holds: 'No commit was validated.' },
	{ id: '34938439', name: 'A merge of another branch is refused', given: validated, params: { fromRequestBranch: false }, expected: 'blocked', holds: `This request's code is on ${BRANCH}.` },
	{ id: 'bb986bd8', name: 'A merge into another branch is refused', given: validated, params: { intoDeploymentBranch: false }, expected: 'blocked', holds: 'The change is merged into main.' },
	{ id: '04259ecf', name: 'A merge that names no commit is refused', given: validated, params: { namesMergeCommit: false }, expected: 'blocked', holds: 'A merge names the commit it made.' },
	{ id: '60f08da6', name: 'Code after the approval holds the merge', given: { ...validated, 'code.validationSetAside': true }, expected: 'blocked', holds: 'The branch moved after the approval: approve the change again.' },
	{ id: '84025b6a', name: 'A merge without the validated commit is refused', given: validated, params: { containsValidated: false }, expected: 'blocked', holds: 'git says the validated commit c0de001 is not in this merge.' },
	{
		id: 'c59bf18a',
		name: 'A page that moved away holds the merge',
		given: { ...validated, 'landing.blockedBy': 'page' },
		expected: 'blocked',
		holds: 'The change "Define the term Basket" (section:basket): Edit 1 (merge on terms'
	},
	{ id: 'be932c23', name: 'A remark not written back holds the merge', given: { ...validated, 'acceptance.remarksToWriteBack': 1 }, expected: 'blocked', holds: 'An accepted observation has not been written back into the spec yet.' },
	{ id: '142388a8', name: 'A cancelled request is not merged', given: { ...validated, 'request.status': 'cancelled' }, expected: 'blocked', holds: 'Only an open request is merged.' },
	{ id: '8cef87fe', name: 'A viewer does not report the merge', given: { ...validated, 'session.workspaceRole': 'viewer' }, expected: 'blocked', holds: '403' },
	{ id: 'b6f230c0', name: 'Someone outside the workspace does not report the merge', given: { ...validated, 'session.workspaceRole': 'none' }, expected: 'blocked', holds: '404' }
];

const door = world(scene, { answers: true, applies: true });

describe('Report the merge, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			const posted = await door.post(POST, [
				{
					op: 'report_merge',
					requestId: REQUEST,
					branch: state['$fromRequestBranch'] === false ? 'feature/another' : BRANCH,
					into: state['$intoDeploymentBranch'] === false ? 'release' : 'main',
					mergeCommit: state['$namesMergeCommit'] === false ? '' : 'm3r6e0020eeee',
					containsValidated: state['$containsValidated'] !== false
				}
			]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok && final['code.merged'] === true ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			// Refused, nothing recorded nor landed, for the scenario's own reason.
			expect(final['code.merged']).toBe(false);
			expect(final['request.landed']).toBe(false);
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});
