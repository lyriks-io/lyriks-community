import { describe, expect, it, vi } from 'vitest';
import { BRANCH, CODE_HEAD, REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Report where the code stands" (action 797a1d90 of feat-25,
 * as EVO-011 spec version 2 has them), run against the real code: the report
 * the index sync sends from git (report_code_state), through POST
 * /api/evolution and the real batch. Succeeds when the batch stands; is
 * refused when the door or the batch refuses it, for the scenario's own reason.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '55da6501';
const ACTION = '797a1d90';
const building = { 'project.deploymentBranch': 'main', 'request.stage': 'implementation', 'request.frozenVersion': 1 };

const SCENARIOS: readonly Scenario[] = [
	{
		id: '3cf1ea42',
		name: "The first report binds the request's branch",
		given: building,
		params: { uncommitted: true },
		expected: 'success',
		then: [
			{ path: 'code.branchBound', operator: 'is_true' },
			{ path: 'code.uncommitted', operator: 'is_true' }
		]
	},
	{ id: 'd2c6f925', name: 'No code is followed without a deployment branch', given: { 'request.stage': 'implementation', 'request.frozenVersion': 1 }, expected: 'blocked', holds: 'The project names no deployment branch.' },
	{ id: 'ae59980b', name: 'No code is reported before Build', given: { 'project.deploymentBranch': 'main', 'request.stage': 'coherence' }, expected: 'blocked', holds: 'Code is reported from the Build until the merge.' },
	{
		id: '7bcab454',
		name: 'Code on the deployment branch is refused',
		given: building,
		params: { fromBranch: 'deployment_branch' },
		expected: 'blocked',
		holds: `Code is never written on the deployment branch main: report it from ${BRANCH}.`
	},
	{
		id: '46aa6f8e',
		name: 'Code from another branch than the bound one is refused',
		given: { ...building, 'code.branchBound': true },
		params: { fromBranch: 'another_branch' },
		expected: 'blocked',
		holds: `This request's code is on ${BRANCH}: report it from there.`
	},
	{
		id: 'a7b0c6fa',
		name: 'A first report from another branch than the one named is refused',
		given: building,
		params: { fromBranch: 'another_branch' },
		expected: 'blocked',
		holds: `This request's code is written on ${BRANCH}.`
	},
	{ id: '8e6f8f22', name: 'A report that names no commit is refused', given: building, params: { namesCommits: false }, expected: 'blocked', holds: 'A report names the branch, its head and its last commit of code.' },
	{
		id: 'b1a8a839',
		name: 'A commit after the approval sets it aside',
		given: { ...building, 'request.stage': 'delivered', 'report.builtForVersion': 1, 'report.closed': true, 'code.branchBound': true, 'code.validated': true },
		expected: 'success',
		then: [{ path: 'code.validationSetAside', operator: 'is_true' }]
	},
	{ id: '8186109f', name: 'A viewer cannot report the code', given: { ...building, 'session.workspaceRole': 'viewer' }, expected: 'blocked', holds: '403' },
	{ id: 'd142dc44', name: 'Someone outside the workspace cannot report the code', given: { ...building, 'session.workspaceRole': 'none' }, expected: 'blocked', holds: '404' }
];

const door = world(scene, { answers: true, applies: true });

/** The branch the checkout is on, as the scenario names it. */
const branchOf = (from: unknown) => (from === 'deployment_branch' ? 'main' : from === 'another_branch' ? 'feature/elsewhere' : BRANCH);

describe('Report where the code stands, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			const names = state['$namesCommits'] !== false;
			const posted = await door.post(POST, [
				{
					op: 'report_code_state',
					requestId: REQUEST,
					branch: branchOf(state['$fromBranch']),
					baseCommit: 'b45e0000aaaa',
					head: names ? 'aaaa0030cccc' : '',
					codeHead: names ? (state['$newCodeCommit'] === false ? CODE_HEAD : 'c0de0030dddd') : '',
					clean: state['$uncommitted'] !== true,
					proofsChecked: 4,
					proofsOnOtherCommits: 0
				}
			]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			expect(final['code.branchBound']).toBe(state['code.branchBound']);
			expect(posted.results.map((r) => r.summary).join(' | ') || String(posted.status)).toContain(scenario.holds);
		});
	}
});
