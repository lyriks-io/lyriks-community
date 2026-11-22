import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, type EvolutionRequest } from '$domain/evolution';
import { BRANCH, REQUEST, assertionsHold, requestOf, stateOf, stateOfRequest, world, type Scenario, type State } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Declare the change live" (action de66178b of feat-35, as
 * EVO-005 spec version 1 has them), run against the real code: the request
 * the scenario describes is stored, declare_deployment goes through POST
 * /api/evolution and the real batch, and what the scenario asserts is read
 * back from the stored dossier. Succeeds when the request is closed and what
 * it carries is in the specification; is refused for the scenario's own
 * reason, nothing landed.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '3513cef5';
const ACTION = 'de66178b';
const approved = { 'request.stage': 'delivered', 'request.frozenVersion': 1, 'report.builtForVersion': 1, 'report.closed': true };
const live = [
	{ path: 'request.status', operator: 'equals', value: 'closed' },
	{ path: 'request.landed', operator: 'is_true' }
] as const;

/** Personas of the action, as the scenarios name them. */
const PERSONA: Readonly<Record<string, State>> = {
	'679bdc6b': { 'session.callerKind': 'ai_client' },
	'53924d28': { 'session.workspaceRole': 'viewer' },
	'235adbe3': { 'session.workspaceRole': 'none' }
};

const SCENARIOS: readonly (Scenario & { readonly persona?: string })[] = [
	{ id: '33efebac', name: 'An approved change is closed and goes live', given: approved, expected: 'success', then: live },
	{
		id: 'ab1b6a4b',
		name: 'With a deployment branch, only the merge declares it live',
		given: { ...approved, 'project.deploymentBranchNamed': true, 'code.branchBound': true, 'code.validated': true },
		expected: 'blocked',
		holds: "Merge the request's branch: its merge declares the change live."
	},
	{
		id: 'acc7a354',
		name: 'A request that brings no code is closed by hand even with a branch',
		given: { ...approved, 'project.deploymentBranchNamed': true, 'request.bringsCode': false },
		expected: 'success',
		then: [live[0]]
	},
	{ id: '57630c1e', name: 'A change not approved does not go live', given: { ...approved, 'request.stage': 'acceptance' }, expected: 'blocked', holds: 'Only an approved request can be declared deployed.' },
	{ id: '91daf67f', name: 'A drafted behaviour that no longer applies holds the landing', given: { ...approved, 'landing.blockedBy': 'behaviour' }, expected: 'blocked', holds: 'The behaviour model of draft "draft:r-1" does not apply' },
	{ id: '8955c879', name: 'A page that moved away holds the landing', given: { ...approved, 'landing.blockedBy': 'page' }, expected: 'blocked', holds: 'The change "Define the term Basket" (section:basket)' },
	{ id: '14f6e6ee', name: 'Rules that changed hold the landing', given: { ...approved, 'landing.blockedBy': 'rules' }, expected: 'blocked', holds: 'The changes to the rules the whole product keeps no longer apply' },
	{ id: '008f4653', name: 'A remark not written back holds the closing', given: { ...approved, 'acceptance.remarksToWriteBack': 1 }, expected: 'blocked', holds: 'An accepted observation has not been written back into the spec yet.' },
	{ id: '5fe995af', name: 'An AI does not close in a team', given: approved, persona: '679bdc6b', expected: 'blocked', holds: 'An AI client cannot close a request.' },
	{ id: 'c6b2495d', name: 'A cancelled request does not go live', given: { ...approved, 'request.status': 'cancelled' }, expected: 'blocked', holds: 'This request is cancelled: reopen it first.' },
	{ id: '06f10719', name: 'A viewer does not close', given: approved, persona: '53924d28', expected: 'blocked', holds: '403' },
	{ id: '6fa618d1', name: 'Someone outside the workspace does not close', given: approved, persona: '235adbe3', expected: 'blocked', holds: '404' },
	{ id: 'd317f73d', name: 'A deleted request does not go live', given: { ...approved, 'request.status': 'deleted' }, expected: 'blocked', holds: 'This request is deleted.', then: [{ path: 'request.landed', operator: 'is_false' }] },
	{ id: 'fc2dfc45', name: 'A change already live is not declared live again', given: { ...approved, 'request.status': 'closed' }, expected: 'blocked', holds: 'This request is closed.' },
	{ id: 'b3d45ded', name: 'Declaring live before its turn asks a reason', given: { ...approved, 'landing.beforeItsTurn': true }, expected: 'blocked', holds: 'EVO-002 lands before this one: say why you declare it live first.' },
	{
		id: '35404aa3',
		name: 'Declaring live before its turn with a reason goes live',
		given: { ...approved, 'landing.beforeItsTurn': true },
		params: { outOfOrderReason: 'EVO-002 is postponed to the next release.' },
		expected: 'success',
		then: [live[1]]
	}
];

/** The request it is set after: EVO-002, under way at Build, amending the same feature. */
const AHEAD = 'r-ahead';
const ahead = (): EvolutionRequest =>
	createEvolutionRequest({
		id: AHEAD,
		title: 'Validate the elements of a specification',
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		frozen: true,
		leafIds: ['feat-1'],
		drafts: [createDraftLeaf({ id: 'draft:ahead', kind: 'amend', baseLeafId: 'feat-1', acceptanceCriteria: [{ id: 'c9', text: 'A validated element reads validated.' }] })]
	});

const engine = { answers: true, applies: true };
const door = world(scene, engine);

beforeEach(() => {
	engine.answers = true;
	engine.applies = true;
});

/** The request the state describes; the order it was set in when it lands after EVO-002. */
function seeded(state: State): void {
	const beforeItsTurn = state['landing.beforeItsTurn'] === true;
	door.seed(state, requestOf(state, beforeItsTurn ? { landsAfter: [AHEAD] } : {}), beforeItsTurn ? [ahead()] : []);
}

describe('Declare the change live, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = { ...stateOf(scenario), ...(scenario.persona ? PERSONA[scenario.persona] : {}) };
			seeded(state);
			engine.applies = state['landing.blockedBy'] !== 'behaviour';
			const reason = state['$outOfOrderReason'];
			const posted = await door.post(POST, [{ op: 'declare_deployment', requestId: REQUEST, ...(typeof reason === 'string' ? { outOfOrderReason: reason } : {}) }]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok && final['request.status'] === 'closed' ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			expect(assertionsHold(scenario, final)).toEqual([]);
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});

describe('A landing out of order is a decision with its reason (EVO-005)', () => {
	it('declaring a request live before the one it is set after asks a reason, kept in its history [criterion:ac-leaf-482d77b2-628d-4556-9729-36ab67c99c9b]', async () => {
		const state = { ...stateOf({ id: '', name: '', given: approved, expected: 'success' }), 'landing.beforeItsTurn': true };
		seeded(state);
		const refused = await door.post(POST, [{ op: 'declare_deployment', requestId: REQUEST }]);
		expect(refused.ok).toBe(false);
		expect(refused.results[0].summary).toBe('EVO-002 lands before this one: say why you declare it live first.');
		expect(door.stored().status).toBe('open');
		const posted = await door.post(POST, [{ op: 'declare_deployment', requestId: REQUEST, outOfOrderReason: 'EVO-002 is postponed to the next release.' }]);
		expect(posted.ok).toBe(true);
		const history = door.stored().history.map((h) => h.summary);
		expect(history).toContain('Declared live before EVO-002, which it was set after: EVO-002 is postponed to the next release.');
		// Landed, it leaves the order it was in: EVO-002 no longer waits on it, nor it on EVO-002.
		expect(door.stored().landsAfter ?? []).toEqual([]);
	});

	it('a merge out of order is recorded, and the history of the request says so [criterion:ac-leaf-fbf8c9b6-bfc7-4b8f-95a5-6bbc8f46458b]', async () => {
		const validated = { ...approved, 'project.deploymentBranchNamed': true, 'code.branchBound': true, 'code.validated': true };
		const state = { ...stateOf({ id: '', name: '', given: validated, expected: 'success' }), 'landing.beforeItsTurn': true };
		seeded(state);
		// The merge is already in git: it is recorded, never refused.
		const posted = await door.post(POST, [{ op: 'report_merge', requestId: REQUEST, branch: BRANCH, into: 'main', mergeCommit: 'm3r6e0020eeee', containsValidated: true }]);
		expect(posted.ok).toBe(true);
		expect(door.stored().status).toBe('closed');
		expect(door.stored().history.map((h) => h.summary)).toContain('Merged before EVO-002, which it was set after (merge m3r6e00)');
	});

	it('a request landing in its turn asks nothing', async () => {
		const state = stateOf({ id: '', name: '', given: approved, expected: 'success' });
		seeded(state);
		const posted = await door.post(POST, [{ op: 'declare_deployment', requestId: REQUEST }]);
		expect(posted.ok).toBe(true);
		expect(door.stored().history.some((h) => h.type === 'landing_order')).toBe(false);
	});
});
