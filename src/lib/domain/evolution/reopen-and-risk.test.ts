import { describe, expect, it } from 'vitest';
import {
	crossStageAct,
	decideFindingAct,
	openRequestAct,
	rebriefAct,
	runCoherenceAct,
	validateStepAct,
	withdrawStepValidationAct,
	type ActContext,
	type ActOutcome
} from './acts';
import { behaviourBaseOf, createDraftLeaf, findingHoldsGate, landBehaviourModel, type Actor, type EvolutionRequest } from './draft';
import { mapCoherenceAnalysis } from './coherence-mapping';
import { deriveImplementationReport, specElementsOf } from './report-derivation';
import { SPEC_STEPS } from './path';

/**
 * What a reopened request, a finding the product already carried and a report
 * read before any code exists must do. Each case was seen wrong on 2026-10-07:
 * a second freeze replayed the whole behaviour model over the feature that held
 * it, a finding the product carried before the request held it at the gate with
 * no way to accept it, and a report on a feature nobody indexed came back empty.
 */

const person: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
let counter = 0;
const ctxFor = (actor: Actor, soloWorkspace = false): ActContext => ({
	actor,
	at: '2026-10-07T12:00:00.000Z',
	newId: () => `id-${++counter}`,
	...(soloWorkspace ? { soloWorkspace } : {})
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);
const opened = (): EvolutionRequest =>
	ok(
		openRequestAct(ctxFor(person), {
			title: 'Promo codes in the cart',
			origin: 'customer_feedback',
			requester: '',
			leafIds: ['feat-cart'],
			knownLeafIds: new Set(['feat-cart'])
		})
	);
const validated = (request: EvolutionRequest): EvolutionRequest => ({
	...request,
	stepValidations: SPEC_STEPS.map((step) => ({
		step,
		validatorIds: [],
		validations: [{ by: 'ana', kind: 'person' as const, at: '2026-10-07T12:00:00.000Z' }]
	}))
});
const gap = { id: 'g1', title: 'Cart contradicts its own invariants', blocking: true, featureRef: 'feat-cart', fixAnchor: '&rtab=inventory' };

describe('a frozen version can be reopened and frozen again', () => {
	it('lands what the model holds once, then replays only what came after', () => {
		const first = landBehaviourModel({ operations: [{ kind: 'add_action' }], mintedIds: ['a1'], updatedAt: 't0' }, 't1');
		expect(first.operations).toEqual([]);
		expect(first.landed?.operations).toHaveLength(1);
		const again = landBehaviourModel({ ...first, operations: [{ kind: 'add_scenario' }], mintedIds: ['s1'] }, 't2');
		expect(again.landed?.operations.map((op) => op.kind)).toEqual(['add_action', 'add_scenario']);
		expect(again.landed?.mintedIds).toEqual(['a1', 's1']);
	});

	it('replays an addition already written over the feature it became', () => {
		expect(behaviourBaseOf({ kind: 'add', baseLeafId: null, materialisedAs: null })).toBeNull();
		expect(behaviourBaseOf({ kind: 'add', baseLeafId: null, materialisedAs: 'feat-coupons' })).toBe('feat-coupons');
		expect(behaviourBaseOf({ kind: 'amend', baseLeafId: 'feat-cart', materialisedAs: null })).toBe('feat-cart');
	});
});

describe('a finding the product already carried never holds the request', () => {
	it('reads the first check as the baseline, and never names a page address as a node', () => {
		const mapping = mapCoherenceAnalysis({
			request: opened(),
			analysis: { readinessScore: 59, gaps: [gap] },
			leafNames: { 'feat-cart': 'Cart' },
			at: 'now'
		});
		expect(mapping.findings[0].scope).toBe('inherited');
		expect(mapping.findings[0].existingNodeId).toBe('feat-cart');
		expect(mapping.baseline).toEqual([mapping.findings[0].id]);
		expect(findingHoldsGate(mapping.findings[0])).toBe(false);
	});

	it('holds the gate on a blocking finding that appeared after the first check', () => {
		const first = ok(
			runCoherenceAct(ctxFor(client), opened(), mapCoherenceAnalysis({ request: opened(), analysis: { readinessScore: 80, gaps: [] }, leafNames: {}, at: 't1' }))
		);
		const later = mapCoherenceAnalysis({ request: first, analysis: { readinessScore: 59, gaps: [gap] }, leafNames: { 'feat-cart': 'Cart' }, at: 't2' });
		expect(later.findings[0].scope).toBe('request');
		expect(findingHoldsGate(later.findings[0])).toBe(true);
	});
});

describe('a blocking finding can be accepted as a risk', () => {
	const withBlocking = (): EvolutionRequest => {
		const first = ok(
			runCoherenceAct(ctxFor(client), opened(), mapCoherenceAnalysis({ request: opened(), analysis: { readinessScore: 80, gaps: [] }, leafNames: {}, at: 't1' }))
		);
		return ok(
			runCoherenceAct(ctxFor(client), first, mapCoherenceAnalysis({ request: first, analysis: { readinessScore: 59, gaps: [gap] }, leafNames: { 'feat-cart': 'Cart' }, at: 't2' }))
		);
	};

	it('asks a reason, is a person act in a team, and opens the gate once accepted', () => {
		let request: EvolutionRequest = { ...validated(withBlocking()), stage: 'coherence' };
		const finding = request.coherenceFindings[0];
		expect(reasonOf(crossStageAct(ctxFor(person), request, { criticalEmptyCount: 0 }))).toMatch(/blocking finding this change brings/);
		expect(reasonOf(decideFindingAct(ctxFor(client), request, finding.id, 'accept_risk', 'known'))).toMatch(/AI client cannot/);
		expect(reasonOf(decideFindingAct(ctxFor(person), request, finding.id, 'accept_risk', ' '))).toBe('Accepting a risk needs a stated reason.');
		request = ok(decideFindingAct(ctxFor(person), request, finding.id.slice(0, 8), 'accept_risk', 'Known since the stock rework'));
		expect(request.coherenceFindings[0].risk).toMatchObject({ by: 'ana', reason: 'Known since the stock rework' });
		expect(crossStageAct(ctxFor(person), request, { criticalEmptyCount: 0 }).ok).toBe(true);
	});

	it('is open to the AI client when the workspace has one member', () => {
		const request = withBlocking();
		expect(decideFindingAct(ctxFor(client, true), request, request.coherenceFindings[0].id, 'accept_risk', 'alone').ok).toBe(true);
	});
});

describe('the implementation report starts from the spec', () => {
	it('lists every declared screen, action and criterion as missing before any code is indexed', () => {
		const spec = specElementsOf({
			surfaces: [{ id: 's1', name: 'Cart', actions: [{ id: 'a1', name: 'Apply promo code' }] }]
		});
		const lines = deriveImplementationReport({
			request: { id: 'r1', iteration: 1, specVersion: 1, leafIds: ['feat-cart'] },
			statuses: { 'feat-cart': { criteria: [{ criterionId: 'c1', title: 'One code per cart', state: 'none' }] } },
			neighbours: {},
			spec: { 'feat-cart': spec },
			leafNames: { 'feat-cart': 'Cart' },
			baseline: new Set(['surface:s1'])
		});
		expect(lines.map((l) => [l.verdict, l.scope, l.requirement])).toEqual([
			['missing', 'request', 'Cart › action "Apply promo code"'],
			['missing', 'request', 'Cart › criterion "One code per cart"'],
			['missing', 'inherited', 'Cart › screen "Cart"']
		]);
		expect(lines.every((l) => l.leafId === 'feat-cart')).toBe(true);
	});

	it('reads a criterion proved by a passing result as conform, and a failing one as non-conform', () => {
		const lines = deriveImplementationReport({
			request: { id: 'r1', iteration: 1, specVersion: 1, leafIds: ['feat-cart'] },
			statuses: {
				'feat-cart': {
					criteria: [
						{ criterionId: 'c1', title: 'One code per cart', state: 'verified' },
						{ criterionId: 'c2', title: 'Unknown code refused', state: 'failing' }
					]
				}
			},
			neighbours: {},
			leafNames: { 'feat-cart': 'Cart' }
		});
		expect(lines.map((l) => l.verdict).sort()).toEqual(['conform', 'non_conform']);
	});
});

describe('a team validates the steps, through a freeze and a reopening', () => {
	const bo: Actor = { id: 'bo', kind: 'person', role: 'member', channel: 'page' };
	const roster = new Set(['ana', 'bo']);
	const team = (actor: Actor) => ctxFor(actor, false);

	it('takes one person\'s validation, refuses the client, and holds the freeze on no step, through a reopening', () => {
		let request: EvolutionRequest = {
			...validated(opened()),
			stage: 'coherence',
			coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: 't' },
			impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 't' },
			// An addition always has something to arbitrate, so every gate applies.
			drafts: [createDraftLeaf({ kind: 'add', name: 'Coupons' })],
			stepValidations: validated(opened()).stepValidations.filter((v) => v.step !== 'technical_spec' && v.step !== 'solution')
		};
		request = {
			...request,
			stepDescriptions: { ...request.stepDescriptions, solution: 'Coupons at checkout.' },
			stepAnswers: { ...request.stepAnswers, solution: { ...request.stepAnswers.solution, examples: 'A coupon takes 10% off the cart.' } }
		};
		expect(reasonOf(validateStepAct(team(client), request, 'solution'))).toMatch(/AI client cannot/);
		// No step holds the freeze: the build waits for the Specification only.
		expect(crossStageAct(team(person), request, { criticalEmptyCount: 0 }).ok).toBe(true);

		request = ok(validateStepAct(team(person), request, 'solution'));
		expect(reasonOf(validateStepAct(team(person), request, 'solution'))).toBe('You already validated this step.');
		request = ok(crossStageAct(team(bo), request, { criticalEmptyCount: 0 }));
		expect(request).toMatchObject({ stage: 'implementation', specVersion: 1, frozen: true });

		// Reopening the frozen version takes the Technical spec's validations back, and the next freeze is version 2.
		request = ok(rebriefAct(team(person), request));
		expect(request).toMatchObject({ stage: 'specification', frozen: false, specVersion: 1 });
		const tech = request.stepValidations.find((v) => v.step === 'technical_spec');
		expect(tech?.validations ?? []).toEqual([]);
		// Validating is optional until the build: the Technical spec is not validated again before the Impact analysis or the freeze.
		request = ok(crossStageAct(team(person), request, { criticalEmptyCount: 0 }));
		request = ok(crossStageAct(team(person), request, { criticalEmptyCount: 0 }));
		expect(request).toMatchObject({ stage: 'implementation', specVersion: 2 });
		expect(request.frozenVersions.map((v) => v.version)).toEqual([1, 2]);
	});

	it('in a team, the client cannot take back the validation a person gave under the same id', () => {
		let request = opened();
		request = ok(validateStepAct(team(person), { ...request, need: { ...request.need, description: 'd', situation: 's', objectives: 'o' } }, 'need'));
		expect(reasonOf(withdrawStepValidationAct(team(client), request, 'need'))).toMatch(/AI client cannot/);
		expect(withdrawStepValidationAct(team(person), request, 'need').ok).toBe(true);
	});
});
