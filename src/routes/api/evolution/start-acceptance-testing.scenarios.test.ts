import { describe, expect, it, vi } from 'vitest';
import { REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Start acceptance testing" (action a4d97f79 of feat-35, as
 * EVO-011 spec version 2 has them), run against the real code: the person (or
 * their AI) asks for the crossing by hand with cross_stage at Build, through
 * POST /api/evolution and the real batch. Succeeds when the request stands in
 * acceptance testing afterwards; is refused when the door or the batch refuses
 * it, the request left where it was. The persona "Community operator" reads as
 * the one member of its workspace: a Community installation locks Evolution
 * whole (EVO-001), so its one account is played on a workspace of one.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = 'a4d97f79';
const built = { 'request.stage': 'implementation', 'request.frozenVersion': 1, 'report.builtForVersion': 1 };
const named = { ...built, 'project.deploymentBranchNamed': true };
const bound = { ...named, 'code.branchBound': true };
const inAcceptance = { path: 'request.stage', operator: 'equals', value: 'acceptance' } as const;

const SCENARIOS: readonly Scenario[] = [
	{
		id: '8cdc26fa',
		name: 'Every requirement is settled: acceptance testing starts',
		given: built,
		expected: 'success',
		then: [inAcceptance, { path: 'report.closed', operator: 'is_true' }, { path: 'code.validated', operator: 'is_false' }]
	},
	{
		id: 'ef69e229',
		name: 'Acceptance testing fixes no commit of the branch',
		given: { ...bound, 'code.validated': true },
		expected: 'success',
		then: [{ path: 'code.validated', operator: 'is_false' }, inAcceptance]
	},
	{ id: '081f8bf5', name: 'Undecided lines hold the verification', given: { ...built, 'report.linesToDecide': 1 }, expected: 'blocked', holds: 'Lines of this report are still undecided.' },
	{ id: '503f9d30', name: 'Lines sent back hold the verification', given: { ...built, 'report.sentBack': 1 }, expected: 'blocked', holds: 'Lines were sent back to the build. Rebuild the report once the code changed.' },
	{
		id: '171734e0',
		name: 'An adoption holds the verification until the spec is checked again',
		given: { ...built, 'report.adoptionAwaitsCheck': true },
		expected: 'blocked',
		holds: 'An adoption amended the spec. Run the readings of the Impact analysis again, coherence and docking, before closing this report.'
	},
	{ id: '4453de0e', name: 'No report, no acceptance testing', given: { 'request.stage': 'implementation', 'request.frozenVersion': 1 }, expected: 'blocked', holds: 'No report has been built for this iteration yet.' },
	{ id: '2911c9c1', name: 'No code reported from the branch holds the validation', given: named, expected: 'blocked', holds: "No code was reported from the request's branch yet." },
	{ id: '6ee80246', name: 'Uncommitted code holds the validation', given: { ...bound, 'code.uncommitted': true }, expected: 'blocked', holds: 'The branch holds uncommitted code: commit it, run the tests again, then validate.' },
	{ id: '1e66818a', name: 'Proofs taken on another commit hold the validation', given: { ...bound, 'code.proofsOnOtherCommits': 2 }, expected: 'blocked', holds: '2 proofs were taken on another commit: run the tests on c0de001' },
	{ id: 'eb149dce', name: 'A request that brings no code needs no branch', given: { ...named, 'request.bringsCode': false }, expected: 'success', then: [inAcceptance] },
	{ id: '1fca817f', name: 'An AI cannot move the change on in a team', given: { ...built, 'session.callerKind': 'ai_client' }, expected: 'blocked', holds: 'An AI client cannot move a request between stages.' },
	{
		id: '7ac5410f',
		name: "The Community operator's AI moves the change on",
		given: { ...built, 'session.workspaceRole': 'operator', 'workspace.singleMember': true, 'session.callerKind': 'ai_client' },
		expected: 'success',
		then: [inAcceptance]
	},
	{ id: '48ccecf2', name: 'A cancelled request does not move', given: { ...built, 'request.status': 'cancelled' }, expected: 'blocked', holds: 'This request is cancelled: reopen it first.' },
	{ id: 'eb7a42c8', name: 'A deleted request does not move', given: { ...built, 'request.status': 'deleted' }, expected: 'blocked', holds: 'This request is deleted.' },
	{ id: '85b7f112', name: 'A viewer does not move the change on', given: { ...built, 'session.workspaceRole': 'viewer' }, expected: 'blocked', holds: '403' },
	{ id: '431ad795', name: 'Someone outside the workspace does not move it', given: { ...built, 'session.workspaceRole': 'none' }, expected: 'blocked', holds: '404' }
];

const door = world(scene, { answers: true, applies: true });

describe('Start acceptance testing, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			door.seed(state, requestOf(state));
			const posted = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok && final['request.stage'] === 'acceptance' ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			// Refused, the request left where it was, for the scenario's own reason.
			expect(final['request.stage']).toBe('implementation');
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});
