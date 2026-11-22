import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftLeaf, createEvolutionRequest, type DraftLeaf, type EvolutionRequest } from '$domain/evolution';
import { ACTION_KEY, REQUEST, assertionsHold, atImpactOf, stateOf, stateOfRequest, world, type Scenario, type State } from './evo011-scenarios.fixture';

/**
 * The scenarios of "Freeze the version and enter the build" (action 0b1de710
 * of feat-31, as EVO-011 spec version 2 has them), run against the real code:
 * Freeze version N, cross_stage from the Impact analysis, through POST
 * /api/evolution and the real batch. The Specification a person stands behind
 * is arranged through the same door first, while the readings had not run (so
 * no validation froze it on its own), then the request is set as the scenario
 * says. Succeeds when the request stands frozen in Build; is refused when the
 * door or the batch refuses it, for the scenario's own reason.
 */

const scene = vi.hoisted(() => ({ view: null as unknown }));
vi.mock('$lib/server/evolution-view.server', async (original) => ({ ...(await original<typeof import('$lib/server/evolution-view.server')>()), loadEvolutionView: async () => scene.view }));
vi.mock('$domain/evolution', async (original) => ({ ...(await original<typeof import('$domain/evolution')>()), dueReadings: () => ({ impact: [], report: false }) }));
vi.mock('$lib/server/sync-bus.server', async (original) => ({ ...(await original<typeof import('$lib/server/sync-bus.server')>()), publishSectionChange: vi.fn() }));
vi.mock('$lib/server/evolution-touched-validation.server', () => ({ readTouchedValidation: async () => ({ readable: true, specValidated: false, lines: [], awaitingChoice: 0, validated: [] }) }));
const { POST } = await import('./+server');

const SURFACE = '13e955f6';
const ACTION = '0b1de710';
const ready = { 'request.stage': 'coherence', 'coherence.ready': true };
const frozen = [
	{ path: 'request.stage', operator: 'equals', value: 'implementation' },
	{ path: 'request.frozen', operator: 'is_true' }
] as const;

const SCENARIOS: readonly Scenario[] = [
	{ id: 'b410997e', name: 'A designer freezes version 1', given: ready, expected: 'success', then: [...frozen, { path: 'request.frozenVersion', operator: 'equals', value: 1 }] },
	{ id: '57fe5f86', name: 'A request sent back freezes version 2', given: { ...ready, 'request.frozenVersion': 1 }, expected: 'success', then: [{ path: 'request.frozenVersion', operator: 'equals', value: 2 }] },
	{
		id: '7f5e8ef9',
		name: 'An undecided blocking finding holds the freeze',
		given: { ...ready, 'coherence.blockingOpen': true },
		expected: 'blocked',
		holds: 'A blocking finding this change brings is still undecided. Fix it, accept it as a risk, or waive the gate with a stated reason.'
	},
	{ id: '619fb498', name: 'No freeze before the coherence check ran', given: { 'request.stage': 'coherence' }, expected: 'blocked', holds: 'The coherence check has not been run on this request.' },
	{ id: '1a3d95df', name: 'A critical answer still empty holds the freeze', given: ready, params: { criticalAnswerEmpty: true }, expected: 'blocked', holds: 'Critical fields are still empty.' },
	{ id: '2f8e933f', name: 'A Specification no person stands behind holds the freeze', given: { ...ready, 'specification.held': false }, expected: 'blocked', holds: 'The Specification is validated first: 1 of ' },
	{ id: '2ffdff26', name: 'A drafted behaviour that no longer applies holds the freeze', given: ready, params: { draftModelsApply: false }, expected: 'blocked', holds: 'The behaviour model of draft "draft:r-1" does not apply: action a9 does not exist' },
	{ id: 'd8a64535', name: 'Nothing to arbitrate is held neither on its answers nor on its steps', given: ready, params: { nothingToArbitrate: true, criticalAnswerEmpty: true }, expected: 'success', then: [frozen[1]] },
	{ id: 'b73ad12a', name: 'An AI cannot freeze in a team', given: { ...ready, 'session.callerKind': 'ai_client' }, expected: 'blocked', holds: 'An AI client cannot move a request between stages.' },
	{ id: '615d94be', name: 'Someone outside the workspace freezes nothing', given: { ...ready, 'session.workspaceRole': 'none' }, expected: 'blocked', holds: '404' },
	{ id: 'c544ba42', name: 'The validated Specification alone lets the freeze through', given: { ...ready, 'specification.held': true, 'request.specStepsValidated': false }, expected: 'success', then: frozen },
	{
		id: '75525d54',
		name: 'No freeze while the actions of the Specification cannot be read',
		given: { ...ready, 'specification.held': true, 'specification.actionsReadable': false },
		expected: 'blocked',
		holds: 'The engine did not answer, so the actions of the Specification cannot be read now.'
	},
	{
		id: '3e31607d',
		name: 'An undecided conflict holds the freeze',
		given: { ...ready, 'concurrent.conflictUndecided': true },
		expected: 'blocked',
		holds: 'A conflict with EVO-002 is undecided: set which lands first, or accept the risk with a reason.'
	}
];

/** Another request under way (EVO-002), frozen and at Build, doing `kind` to the feature this request amends. */
const OTHER = 'r-other';
const other = (kind: DraftLeaf['kind']): EvolutionRequest =>
	createEvolutionRequest({
		id: OTHER,
		title: 'Retire the checkout',
		stage: 'implementation',
		status: 'open',
		specVersion: 1,
		frozen: true,
		leafIds: ['feat-1'],
		drafts: [createDraftLeaf({ id: 'draft:other', kind, baseLeafId: 'feat-1', acceptanceCriteria: kind === 'amend' ? [{ id: 'c8', text: 'A cart keeps its coupon.' }] : [] })]
	});
/** The other requests the state says are under way: one that removes the feature this request amends, while the conflict is undecided. */
const othersOf = (state: State): EvolutionRequest[] => (state['concurrent.conflictUndecided'] === true ? [other('remove')] : []);

const engine = { answers: true, applies: true };
const door = world(scene, engine);

beforeEach(() => {
	engine.answers = true;
	engine.applies = true;
});

describe('Freeze the version and enter the build, through POST /api/evolution', () => {
	for (const scenario of SCENARIOS) {
		it(`${scenario.name} [unspa:${SURFACE}:${ACTION}:${scenario.id}]`, async () => {
			const state = stateOf(scenario);
			const target = atImpactOf(state);
			// The Specification a person stands behind, validated while the readings had not run: nothing froze on its own.
			const person = { ...state, 'session.callerKind': 'person', 'session.workspaceRole': 'designer' };
			const unread = atImpactOf({ ...person, 'coherence.ready': false, 'coherence.blockingOpen': false, $criticalAnswerEmpty: false });
			door.seed(person, unread, othersOf(state));
			const items = [{ op: 'validate_field', requestId: REQUEST, ...ACTION_KEY }, ...door.answersOf(unread)];
			// Not held: the action an AI wrote still waits for a person.
			if (state['specification.held'] === false) items.shift();
			expect((await door.post(POST, items)).ok).toBe(true);
			const validated = door.stored();
			expect(validated.stage).toBe('coherence');
			door.seed(state, { ...validated, need: target.need, coherenceReport: target.coherenceReport, coherenceFindings: target.coherenceFindings, freezeHeld: undefined }, othersOf(state));
			engine.answers = state['specification.actionsReadable'] !== false;
			engine.applies = state['$draftModelsApply'] !== false;
			const posted = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
			const final = stateOfRequest(door.stored());
			expect(posted.ok && final['request.frozen'] === true ? 'success' : 'blocked').toBe(scenario.expected);
			if (scenario.expected === 'success') {
				expect(assertionsHold(scenario, final)).toEqual([]);
				return;
			}
			expect(final['request.stage']).toBe('coherence');
			const said = posted.results.map((r) => r.summary).join(' | ') || String(posted.status);
			expect(said).toContain(scenario.holds);
		});
	}
});

describe('The freeze and the requests under way (EVO-005)', () => {
	/** The request at the Impact analysis with its Specification validated by a person, the readings in, beside `others`. */
	async function readyToFreeze(others: EvolutionRequest[]) {
		const state = stateOf({ id: '', name: '', given: ready, expected: 'success' });
		const person = { ...state, 'session.callerKind': 'person', 'session.workspaceRole': 'designer' };
		const unread = atImpactOf({ ...person, 'coherence.ready': false, 'coherence.blockingOpen': false });
		door.seed(person, unread, others);
		expect((await door.post(POST, [{ op: 'validate_field', requestId: REQUEST, ...ACTION_KEY }, ...door.answersOf(unread)])).ok).toBe(true);
		const target = atImpactOf(state);
		door.seed(state, { ...door.stored(), need: target.need, coherenceReport: target.coherenceReport, coherenceFindings: target.coherenceFindings, freezeHeld: undefined }, others.map((o) => door.storedOf(o.id) ?? o));
	}

	it('at the freeze, a request is set after every overlapping request under way frozen before it [criterion:ac-leaf-9f45f55b-87dc-4037-8fef-e202cd081cf0]', async () => {
		await readyToFreeze([other('amend')]);
		const posted = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(posted.ok).toBe(true);
		expect(door.stored().stage).toBe('implementation');
		expect(door.stored().landsAfter).toEqual([OTHER]);
		expect(door.stored().history.map((h) => h.summary)).toContain('Set to land after EVO-002, frozen before it');
	});

	it('a request that removes what another request under way uses is not frozen until the order is set or the risk accepted with a reason [criterion:ac-leaf-2a916c7a-e055-4552-8672-80e0393fba9d]', async () => {
		await readyToFreeze([other('remove')]);
		const held = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(held.ok).toBe(false);
		expect(held.results[0].summary).toBe('A conflict with EVO-002 is undecided: set which lands first, or accept the risk with a reason.');
		expect(door.stored().stage).toBe('coherence');
		// A risk accepted without a reason decides nothing.
		const unreasoned = await door.post(POST, [{ op: 'accept_conflict_risk', requestId: REQUEST, otherRequestId: OTHER, reason: ' ' }]);
		expect(unreasoned.results[0].summary).toBe('Accepting a risk needs a stated reason.');
		const accepted = await door.post(POST, [{ op: 'accept_conflict_risk', requestId: REQUEST, otherRequestId: OTHER, reason: 'The checkout is retired after this lands.' }]);
		expect(accepted.ok).toBe(true);
		expect(door.storedOf(OTHER)?.pairDecisions?.[0]).toMatchObject({ requestId: REQUEST, kind: 'risk', reason: 'The checkout is retired after this lands.' });
		const frozen = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(frozen.ok).toBe(true);
		expect(door.stored().stage).toBe('implementation');
	});

	it('an order a person set decides the conflict: the freeze goes through [criterion:ac-leaf-2a916c7a-e055-4552-8672-80e0393fba9d]', async () => {
		await readyToFreeze([other('remove')]);
		expect((await door.post(POST, [{ op: 'set_landing_order', requestId: REQUEST, otherRequestId: OTHER, landsFirst: 'this' }])).ok).toBe(true);
		const frozen = await door.post(POST, [{ op: 'cross_stage', requestId: REQUEST }]);
		expect(frozen.ok).toBe(true);
		// Already ordered by the person: the freeze sets no other order.
		expect(door.stored().landsAfter ?? []).toEqual([]);
		expect(door.storedOf(OTHER)?.landsAfter).toEqual([REQUEST]);
	});
});
