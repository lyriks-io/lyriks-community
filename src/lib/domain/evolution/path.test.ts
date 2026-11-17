import { describe, expect, it } from 'vitest';
import {
	addDraftLeafAct,
	removeDraftLeafAct,
	answerStepAct,
	crossStageAct,
	decideProposalAct,
	declareDeploymentAct,
	markStepNotApplicableAct,
	proposeAct,
	redrawDiagramAct,
	updateNeedAct,
	updateStepDescriptionAct,
	markOpenQuestionAct,
	postOnFieldAct,
	validateStepAct,
	withdrawStepValidationAct,
	type ActContext,
	type ActOutcome
} from './acts';
import { createDraftLeaf, createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { isAskedOn, blockFieldByPath } from './blocks';
import { readRequestMaturity } from './maturity';
import { isStepValidated, needCriticalEmpty, readPath, unvalidatedSpecSteps } from './path';
import { withSolutionValidated } from './solution-validated.fixture';
import { dockingCounts, dockingMap } from './docking';

/**
 * The path of a request: the need asked once, the subjects asked only what is
 * theirs, each important step validated by its people, and the deployment
 * declared. What these tests pin is the specification of feat-evo-request-need,
 * feat-evo-request-lifecycle (ac-evo-req-16..21) and feat-evo-stage-gate
 * (ac-evo-gate-need, ac-evo-gate-steps).
 */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const bo: Actor = { id: 'bo', kind: 'person', role: 'member', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor, soloWorkspace = false): ActContext => ({
	actor,
	at: '2026-10-07T10:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);
const team = new Set(['ana', 'bo', 'cy']);

/** A Solution written in prose: what changes, and how we will know it works (ac-evo-sol-prose). */
const SOLUTION = {
	stepDescriptions: { solution: 'Wrap a gift at checkout.', functional_spec: '', technical_spec: '' },
	stepAnswers: { solution: { examples: 'A wrapped order shows a ribbon on the receipt.', out_of_scope: '' }, functional_spec: { refusals: '', failures: '' }, technical_spec: { data: '' } }
};
const open = (overrides: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	createEvolutionRequest({ id: 'r1', title: 'Gift wrap', origin: 'customer_feedback', stage: 'specification', ...SOLUTION, ...overrides });

/** A need that says why: the two critical answers are given. */
const NEED = { description: 'd', situation: 'Support wraps 40 returns a week by hand.', symptoms: '', cost: '', objectives: 'Wrap at checkout.', measures: '' };

describe('the need is asked once, for the request', () => {
	it('keeps what a person writes on the request and counts the two critical answers', () => {
		let request = open();
		expect(needCriticalEmpty(request)).toEqual(['00-need.situation', '00-need.objectives']);
		request = ok(updateNeedAct(ctxFor(ana), request, { description: 'People wrap gifts by hand.', situation: 'Support wraps 40 orders a week by hand.' }));
		expect(request.need.situation).toBe('Support wraps 40 orders a week by hand.');
		expect(needCriticalEmpty(request)).toEqual(['00-need.objectives']);
		const maturity = readRequestMaturity(request, new Set(), []);
		expect(maturity.criticalEmptyFields).toContain('00-need.objectives');
	});

	it('never marks the Need not applicable as a whole, yet reads and lifts a mark set before (ac-evo-req-16)', () => {
		expect(reasonOf(markStepNotApplicableAct(ctxFor(ana), open(), { step: 'need', notApplicable: true, reason: 'A typo fix.' }))).toBe(
			'Only Functional spec and Technical spec can be marked not applicable.'
		);
		expect(reasonOf(markStepNotApplicableAct(ctxFor(ana), open(), { step: 'build', notApplicable: true, reason: 'small' }))).toBe(
			'Only Functional spec and Technical spec can be marked not applicable.'
		);
		expect(reasonOf(markStepNotApplicableAct(ctxFor(ana), open(), { step: 'technical_spec', notApplicable: true, reason: ' ' }))).toBe('Say why this step does not apply.');
		// A Need marked before this rule keeps its mark, owes nothing, and the mark can still be lifted.
		const legacy = open({ skippedSteps: [{ step: 'need', reason: 'A typo fix.', by: 'ana', at: 't' }] });
		expect(needCriticalEmpty(legacy)).toEqual([]);
		expect(ok(markStepNotApplicableAct(ctxFor(ana), legacy, { step: 'need', notApplicable: false, reason: '' })).skippedSteps).toEqual([]);
	});

	it('takes a proposed answer of the need through the same signature as a feature value', () => {
		const checks = { sourceExists: () => true, bannedWords: [] };
		let request = ok(
			proposeAct(
				ctxFor(client),
				open(),
				{ fieldPath: '00-need.objectives', leafId: null, value: 'Wrap at checkout', reasoning: '', whatWasRead: 'the brief', whatWasInferred: 'the goal', citedSourceIds: ['src-1'] },
				checks
			)
		);
		const proposal = request.proposals[0];
		expect(proposal.canonicalPath).toBe('request.need.objectives');
		// A client never accepts in a team; a person does, and the value lands on the request.
		expect(reasonOf(decideProposalAct(ctxFor(client), request, proposal.id, { decision: 'accept' }, () => ({ ok: true })))).toBe(
			'An AI client may create proposals but never accept one.'
		);
		let wrote = false;
		request = ok(
			decideProposalAct(ctxFor(ana), request, proposal.id, { decision: 'accept' }, () => {
				wrote = true;
				return { ok: true };
			})
		);
		expect(request.need.objectives).toBe('Wrap at checkout');
		expect(wrote).toBe(false);
	});
});

describe('a subject is asked only what is its own', () => {
	it('asks a new feature its objective, effect and criteria, a changed one its criteria, a removed one nothing', () => {
		const objective = blockFieldByPath('01-origin.objective')!;
		const problem = blockFieldByPath('02-problem.statement')!;
		const criteria = blockFieldByPath('05-functional.acceptance')!;
		expect(isAskedOn(objective, 'add')).toBe(true);
		expect(isAskedOn(objective, 'amend')).toBe(false);
		expect(isAskedOn(problem, 'add')).toBe(false);
		expect(isAskedOn(criteria, 'amend')).toBe(true);
		expect(isAskedOn(criteria, 'remove')).toBe(false);
	});
});

describe('every important step is validated by its people', () => {
	it('freezes once the Solution is validated, the Need, the Functional and the Technical spec left unvalidated', () => {
		let request = open({ need: NEED, coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: 'now' }, stage: 'coherence' });
		expect(reasonOf(crossStageAct(ctxFor(ana), request, { criticalEmptyCount: 0 }))).toBe(
			'The Solution is not validated yet: a person validates it before the build.'
		);
		// Validating the other steps does not stand in for the Solution.
		for (const step of ['need', 'technical_spec']) request = ok(validateStepAct(ctxFor(ana), request, step));
		expect(reasonOf(crossStageAct(ctxFor(ana), request, { criticalEmptyCount: 0 }))).toBe(
			'The Solution is not validated yet: a person validates it before the build.'
		);
		const onlySolution = ok(validateStepAct(ctxFor(ana), open({ need: NEED, coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: 'now' }, stage: 'coherence' }), 'solution'));
		expect(unvalidatedSpecSteps(onlySolution)).toEqual(['need', 'functional_spec', 'technical_spec']);
		const frozen = ok(crossStageAct(ctxFor(ana), onlySolution, { criticalEmptyCount: 0 }));
		expect(frozen.stage).toBe('implementation');
	});

	it('reads the Impact analysis apart from the Technical spec: entered with no step validated, never validated itself', () => {
		const coupons = createDraftLeaf({ id: 'draft:coupons', kind: 'add', name: 'Coupons' });
		let request = open({ need: NEED, drafts: [coupons], leafIds: [coupons.id] });
		// Validating is optional until the build: no step holds the Impact analysis.
		expect(unvalidatedSpecSteps(request)).toEqual(['need', 'solution', 'functional_spec', 'technical_spec']);
		request = ok(crossStageAct(ctxFor(ana), request, { criticalEmptyCount: 0 }));
		expect(request.stage).toBe('coherence');
		const path = readPath(request, { questionsOwed: 0, pendingProposals: 0 });
		expect(path.find((s) => s.current)?.step).toBe('impact_analysis');
		// The platform reads it; leaving it is the decision (ac-evo-form-impact-step).
		expect(path.find((s) => s.step === 'impact_analysis')?.validation).toBeNull();
		expect(reasonOf(validateStepAct(ctxFor(ana), request, 'impact_analysis'))).toBe('Need, Solution, Functional spec, Technical spec and Approval are validated.');
	});

	it('says what the Technical spec holds: its prose, the constraints and the data it moves', () => {
		const tech = (request: EvolutionRequest) => readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'technical_spec')!;
		expect(tech(open()).progress).toBe('todo');
		const described = open({ stepDescriptions: { solution: 'Wrap a gift.', functional_spec: '', technical_spec: 'Texts go through our SMS provider.' } });
		// Its diagram is drawn from it before the step stands (ac-evo-tech-uml-sync).
		expect(tech(described)).toMatchObject({ progress: 'in_progress', detail: 'Written; the diagram is behind the description, to redraw from it.' });
		const drawn: EvolutionRequest = {
			...described,
			stepAnswers: { ...described.stepAnswers, technical_spec: { ...described.stepAnswers.technical_spec, diagram: 'system SMS provider' } },
			technicalAlignment: { description: 'Texts go through our SMS provider.', at: 't' }
		};
		expect(tech(drawn)).toMatchObject({ progress: 'done', detail: 'Written.' });
		// The data is said in prose; the tables are declared at the Impact analysis (ac-evo-tech-prose).
		const dataOnly = open({ stepAnswers: { ...SOLUTION.stepAnswers, technical_spec: { data: 'Orders get a "text sent at" date.' } } });
		expect(tech(dataOnly)).toMatchObject({ progress: 'in_progress', detail: 'The technical constraints and risks are not described yet.' });
	});

	it('lets anyone with access validate, a viewer excepted, and one validation is enough by default', () => {
		const viewer: Actor = { ...bo, role: 'viewer' };
		expect(reasonOf(validateStepAct(ctxFor(viewer), open(), 'approval'))).toBe('A viewer cannot validate a step.');
		const request = ok(validateStepAct(ctxFor(bo), open(), 'approval'));
		expect(isStepValidated(request, 'approval')).toBe(true);
		expect(readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'approval')?.validation).toEqual({ validated: true, given: ['bo'], expected: [], gone: [] });
		expect(ok(withdrawStepValidationAct(ctxFor(bo), request, 'approval')).stepValidations.find((v) => v.step === 'approval')?.validations).toHaveLength(0);
	});

	it('follows the roster: a client validates for a single member, never for a team', () => {
		expect(reasonOf(validateStepAct(ctxFor(client), open(), 'solution'))).toBe('An AI client cannot validate a step.');
		expect(isStepValidated(ok(validateStepAct(ctxFor(client, true), open(), 'solution')), 'solution')).toBe(true);
	});

	it('asks again when what a step holds changes', () => {
		let request = ok(validateStepAct(ctxFor(ana), open({ need: NEED }), 'need'));
		request = withSolutionValidated(ok(validateStepAct(ctxFor(ana), request, 'solution')));
		// A feature named from the validated Solution is read at the Impact analysis and reopens no step (ac-evo-req-21).
		request = ok(addDraftLeafAct(ctxFor(ana), request, { kind: 'add', name: 'Gift wrap option' }, new Set()));
		expect(isStepValidated(request, 'solution')).toBe(true);
		request = ok(updateNeedAct(ctxFor(ana), request, { objectives: 'Wrap at checkout' }));
		expect(isStepValidated(request, 'need')).toBe(false);
		expect(isStepValidated(request, 'solution')).toBe(true);
		// A new answer of the Solution reopens it.
		request = ok(answerStepAct(ctxFor(ana), request, { step: 'solution', question: 'out_of_scope', answer: 'No paper choice.' }));
		expect(isStepValidated(request, 'solution')).toBe(false);
	});

	it('never stands behind a need that does not say why yet', () => {
		expect(reasonOf(validateStepAct(ctxFor(ana), open(), 'need'))).toBe('The need still owes its current situation or its objectives.');
	});

	it('approves only once Approval is validated', () => {
		const request = open({ stage: 'acceptance' });
		expect(reasonOf(crossStageAct(ctxFor(ana), request, { criticalEmptyCount: 0 }))).toBe('Approval still waits for someone to validate it.');
		const approved = ok(crossStageAct(ctxFor(ana), ok(validateStepAct(ctxFor(ana), request, 'approval')), { criticalEmptyCount: 0 }));
		expect(approved.stage).toBe('delivered');
	});
});

describe('the deployment ends the path', () => {
	it('is declared once the change is approved, with its release, and closes the request', () => {
		expect(reasonOf(declareDeploymentAct(ctxFor(ana), open({ stage: 'acceptance' }), {}))).toBe(
			'Only an approved request can be declared deployed.'
		);
		const live = ok(declareDeploymentAct(ctxFor(ana), open({ stage: 'delivered' }), { releaseId: '2026.10-64' }));
		expect(live.status).toBe('closed');
		expect(live.deployment).toMatchObject({ releaseId: '2026.10-64', declaredBy: 'ana' });
		expect(readPath(live, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.current)?.step).toBe('deployment');
	});
});

describe('the path opens on the first step not done', () => {
	it('reads Need first, then the first step still to write once the need is answered, validated or not', () => {
		const empty = readPath(open(), { questionsOwed: 0, pendingProposals: 0 });
		expect(empty.map((s) => s.step)).toEqual(['need', 'solution', 'functional_spec', 'technical_spec', 'impact_analysis', 'build', 'approval', 'deployment']);
		expect(empty.find((s) => s.current)?.step).toBe('need');
		const request = ok(updateNeedAct(ctxFor(ana), open(), { description: 'd', situation: 's', objectives: 'o' }));
		// The Solution is written already: the request reads at the Functional spec, nobody having validated anything.
		expect(readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.current)?.step).toBe('functional_spec');
		expect(readPath(ok(validateStepAct(ctxFor(ana), request, 'need')), { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.current)?.step).toBe('functional_spec');
	});
});

describe('validating is optional until the build', () => {
	const at = (request: EvolutionRequest) => readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.current)?.step;

	it('keeps the request at the Impact analysis when a validation falls before the freeze, and drafts on', () => {
		const standing = withSolutionValidated(open({ stage: 'coherence', need: NEED }));
		expect(at(standing)).toBe('impact_analysis');
		const fell = { ...standing, stepValidations: standing.stepValidations.filter((v) => v.step !== 'functional_spec' && v.step !== 'technical_spec') };
		expect(at(fell)).toBe('impact_analysis');
		expect(ok(addDraftLeafAct(ctxFor(ana), fell, { kind: 'add', name: 'Gift wrap option' }, new Set())).drafts).toHaveLength(1);
		// A frozen version is read where it stands: only a rebrief reopens it.
		expect(at({ ...fell, stage: 'implementation', frozen: true, specVersion: 1 })).toBe('build');
	});

	it('writes the Specification from a Solution nobody validated, and lets a draft be taken out', () => {
		const drafted = ok(addDraftLeafAct(ctxFor(ana), open({ need: NEED }), { kind: 'add', name: 'Gift wrap option' }, new Set()));
		expect(drafted.drafts).toHaveLength(1);
		expect(ok(removeDraftLeafAct(ctxFor(ana), drafted, drafted.drafts[0].id)).drafts).toEqual([]);
	});
});

describe('the docking map says whether each piece fits', () => {
	it('reads a blocking finding as a collision, a minor one as friction, and the rest as fitting', () => {
		const request = open({
			impactFindings: [
				{ id: 'i1', hypothesis: 'change', section: 'leaves', nodeId: 'feat-cart', nodeLabel: 'Cart', nodeKind: 'feature', groupPath: [], note: '', codeWork: null, depth: 1, severity: 'low' },
				{ id: 'i2', hypothesis: 'change', section: 'permissions', nodeId: 'role-admin', nodeLabel: 'Admin', nodeKind: 'role', groupPath: [], note: '', codeWork: null, depth: 2, severity: 'low' },
				{ id: 'i3', hypothesis: 'change', section: 'glossary_terms', nodeId: 'term-gift', nodeLabel: 'Gift', nodeKind: 'term', groupPath: [], note: '', codeWork: null, depth: 2, severity: 'none' }
			].map((f) => ({ ...f, migrationImplied: false, ruleWork: null })) as unknown as EvolutionRequest['impactFindings'],
			coherenceFindings: [
				{ id: 'c1', axis: 'functional', severity: 'blocking', title: 'The cart forbids a second total.', requestNodeId: 'x', existingNodeId: 'feat-cart', fixNowTarget: '', published: true },
				{ id: 'c2', axis: 'semantic', severity: 'minor', title: 'Two words for the same role.', requestNodeId: 'role-admin', existingNodeId: 'y', fixNowTarget: '', published: true }
			]
		});
		const points = dockingMap(request, { knownLeafIds: new Set(['feat-cart']), dependentsOf: () => [], nameOf: (id) => id });
		expect(points.find((p) => p.nodeId === 'feat-cart')).toMatchObject({ qualification: 'collision', reason: 'The cart forbids a second total.' });
		expect(points.find((p) => p.nodeId === 'role-admin')?.qualification).toBe('friction');
		expect(points.find((p) => p.nodeId === 'term-gift')?.qualification).toBe('fits');
		expect(points[0].qualification).toBe('collision');
	});

	it('reads a removal as a collision on what depends on it, and a new feature with no place as a missing anchor', () => {
		const request = open({
			drafts: [
				createDraftLeaf({ id: 'draft:rm', kind: 'remove', baseLeafId: 'feat-coupons' }),
				createDraftLeaf({ id: 'draft:new', kind: 'add', name: 'Gift wrap', dependsOn: ['feat-ghost'] })
			]
		});
		const points = dockingMap(request, {
			knownLeafIds: new Set(['feat-coupons', 'feat-checkout']),
			dependentsOf: (id) => (id === 'feat-coupons' ? [{ id: 'feat-checkout', name: 'Checkout' }] : []),
			nameOf: (id) => (id === 'feat-coupons' ? 'Coupons' : id)
		});
		expect(points.find((p) => p.nodeId === 'feat-checkout')).toMatchObject({
			qualification: 'collision',
			reason: '"Checkout" depends on "Coupons", which this request removes.'
		});
		expect(dockingCounts(points)).toEqual({ collision: 1, missing_anchor: 2, friction: 0, fits: 0 });
	});
});

describe('a note on how the change gets proved is no contact point [criterion:ac-leaf-ac-evo-dock-8]', () => {
	const finding = (over: Partial<EvolutionRequest['coherenceFindings'][number]>) => ({
		id: 'c1', axis: 'functional' as const, severity: 'minor' as const, title: 'The rule "R" is proved once the drafts land.', requestNodeId: 'rules:r1', existingNodeId: 'project:rules', fixNowTarget: '', published: true, ...over
	});
	const pointsOf = (coherenceFindings: EvolutionRequest['coherenceFindings']) =>
		dockingMap(open({ coherenceFindings }), { knownLeafIds: new Set(), dependentsOf: () => [], nameOf: (id) => id });

	it('leaves a proof note out of the map', () => {
		expect(pointsOf([finding({ note: true })])).toEqual([]);
	});

	it('names a point no leaf names by what the page calls it, never by its id', () => {
		expect(pointsOf([finding({ title: 'Two rules say the same.' })])[0]).toMatchObject({ label: 'Rules the whole product keeps', qualification: 'friction' });
	});
});

describe('the freeze carries the need into a new feature', () => {
	it('writes the situation as its problem and the cost as its value, where the draft holds none', async () => {
		const { materialiseDrafts } = await import('./materialise');
		const request = open({
			need: { description: '', situation: 'Support wraps 40 orders a week by hand.', symptoms: '', cost: 'Six hours a week.', objectives: 'o', measures: '' },
			drafts: [createDraftLeaf({ id: 'draft:wrap', kind: 'add', name: 'Gift wrap', coreId: 'core' })]
		});
		const written = materialiseDrafts({ features: [], leafMeta: {} } as never, request, '2026-10-07T10:00:00.000Z');
		const id = written.request.drafts[0].materialisedAs!;
		const meta = (written.features as unknown as { leafMeta: Record<string, { problem?: string; value?: string }> }).leafMeta[id];
		expect(meta.problem).toBe('Support wraps 40 orders a week by hand.');
		expect(meta.value).toBe('Six hours a week.');
	});
});

describe('the Functional spec is written in prose (ac-evo-func-prose)', () => {
	const functional = (request: EvolutionRequest) => readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'functional_spec')!;

	it('asks how it goes and what it refuses before anyone validates it; what goes wrong stays optional', () => {
		let request = open();
		expect(functional(request).progress).toBe('todo');
		expect(reasonOf(validateStepAct(ctxFor(ana), request, 'functional_spec'))).toBe('The Functional spec still owes its description or what the product refuses.');
		request = ok(updateStepDescriptionAct(ctxFor(ana), request, { step: 'functional_spec', description: 'The baker marks the bag ready; the customer gets a text.' }));
		expect(functional(request)).toMatchObject({ progress: 'in_progress', detail: 'Still to write: its rules.' });
		request = ok(answerStepAct(ctxFor(ana), request, { step: 'functional_spec', question: 'refusals', answer: 'No text without a phone number.' }));
		expect(request.stepAnswers.functional_spec.refusals).toBe('No text without a phone number.');
		// The diagram follows the texts before the step stands (ac-evo-func-uml-sync).
		expect(functional(request)).toMatchObject({ progress: 'in_progress', detail: 'Written; the diagram is behind the texts, to redraw from them.' });
		request = ok(redrawDiagramAct(ctxFor(client), request, { diagram: 'actor Baker\nuse case Mark a bag ready: Baker' }));
		// No behaviour model is asked for: the text is enough (ac-evo-func-model).
		expect(functional(request)).toMatchObject({ progress: 'done', detail: 'Written.' });
		request = ok(validateStepAct(ctxFor(ana), request, 'functional_spec'));
		expect(isStepValidated(request, 'functional_spec')).toBe(true);
	});

	it('versions each answer, withdraws the validation it changes, and refuses a question the step does not ask', () => {
		let request = open({
			stepDescriptions: { solution: 'Wrap a gift.', functional_spec: 'It goes.', technical_spec: '' },
			stepAnswers: { ...SOLUTION.stepAnswers, functional_spec: { refusals: 'Nothing twice.', failures: '', diagram: 'actor Baker' } },
			diagramAlignment: { description: 'It goes.', refusals: 'Nothing twice.', failures: '', at: 't' }
		});
		request = ok(validateStepAct(ctxFor(ana), request, 'functional_spec'));
		request = ok(answerStepAct(ctxFor(bo), request, { step: 'functional_spec', question: 'failures', answer: 'The provider is down: retried for an hour.' }));
		expect(isStepValidated(request, 'functional_spec')).toBe(false);
		expect(request.fieldVersions.filter((v) => v.key === 'step.functional_spec.failures').map((v) => v.value)).toEqual(['The provider is down: retried for an hour.']);
		expect(reasonOf(answerStepAct(ctxFor(ana), request, { step: 'functional_spec', question: 'mockups', answer: 'x' }))).toBe('"functional_spec" asks no question "mockups".');
	});

	it('owes nothing once the step is marked not applicable', () => {
		const request = ok(markStepNotApplicableAct(ctxFor(ana), open(), { step: 'functional_spec', notApplicable: true, reason: 'No behaviour changes.' }));
		expect(functional(request).progress).toBe('not_applicable');
	});
});

describe('the Solution is written in prose (ac-evo-sol-prose)', () => {
	const solution = (request: EvolutionRequest) => readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'solution')!;

	it('asks what changes and how we will know it works, never the features it touches', () => {
		const blank = open({ stepDescriptions: { solution: '', functional_spec: '', technical_spec: '' }, stepAnswers: { ...SOLUTION.stepAnswers, solution: { examples: '', out_of_scope: '' } } });
		expect(solution(blank).progress).toBe('todo');
		expect(reasonOf(validateStepAct(ctxFor(ana), blank, 'solution'))).toBe('The Solution still owes its description or how we will know it works.');
		let request = ok(updateStepDescriptionAct(ctxFor(ana), blank, { step: 'solution', description: 'Wrap a gift at checkout.' }));
		expect(solution(request)).toMatchObject({ progress: 'in_progress', detail: 'Still to write: how we will know it works.' });
		request = ok(answerStepAct(ctxFor(ana), request, { step: 'solution', question: 'examples', answer: 'A wrapped order shows a ribbon.' }));
		// No feature named, and the Solution is done: what it touches is read at the Impact analysis.
		expect(request.leafIds).toEqual([]);
		expect(solution(request)).toMatchObject({ progress: 'done', detail: 'Written.' });
		expect(readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'impact_analysis')?.detail).toBe('Name the features the change touches, from the Solution.');
	});

	it('discusses and postpones each of its questions like the Need, a postponed required one counting as owed (ac-evo-form-question-acts)', () => {
		let request = ok(postOnFieldAct(ctxFor(bo), open(), 'step.solution.examples', null, 'One example per kind of order?'));
		expect(request.fieldThreads.map((t) => t.key)).toEqual(['step.solution.examples']);
		request = ok(markOpenQuestionAct(ctxFor(bo), request, 'step.solution.examples', null));
		expect(reasonOf(validateStepAct(ctxFor(ana), request, 'solution'))).toBe('The Solution still owes its description or how we will know it works.');
		expect(reasonOf(markOpenQuestionAct(ctxFor(bo), open(), 'step.solution.nothing', null))).toMatch(/^No field is named "step.solution.nothing"/);
	});

	it('posts a message of its own or a reply to one message of the same thread [criterion:ac-leaf-ac-evo-fthread-reply]', () => {
		let request = ok(postOnFieldAct(ctxFor(bo), open(), 'step.solution.examples', null, 'One example per kind of order?'));
		const first = request.fieldThreads[0].messages[0];
		request = ok(postOnFieldAct(ctxFor(ana), request, 'step.solution.examples', null, 'Yes, one each.', first.id));
		request = ok(postOnFieldAct(ctxFor(ana), request, 'step.solution.examples', null, 'And one for a cancelled order.'));
		const [, reply, own] = request.fieldThreads[0].messages;
		expect(reply).toMatchObject({ body: 'Yes, one each.', replyTo: first.id });
		expect(own.replyTo).toBeUndefined();
		// A reply answers a message the thread holds, never one of another thread or none.
		expect(reasonOf(postOnFieldAct(ctxFor(ana), request, 'step.solution.examples', null, 'Agreed.', 'm-elsewhere'))).toBe('The message you answer is not in this thread.');
		expect(reasonOf(postOnFieldAct(ctxFor(ana), open(), 'step.solution.out_of_scope', null, 'Agreed.', first.id))).toBe('The message you answer is not in this thread.');
	});

	it('comments every text of the Functional spec and the Technical spec too, their descriptions and diagrams included (ac-evo-form-question-acts)', () => {
		let request = open();
		for (const path of ['step.functional_spec.description', 'step.functional_spec.refusals', 'step.functional_spec.diagram', 'step.technical_spec.description', 'step.technical_spec.diagram'])
			request = ok(postOnFieldAct(ctxFor(bo), request, path, null, 'Is this the whole of it?'));
		expect(request.fieldThreads.map((t) => t.key)).toEqual([
			'step.functional_spec.description',
			'step.functional_spec.refusals',
			'step.functional_spec.diagram',
			'step.technical_spec.description',
			'step.technical_spec.diagram'
		]);
	});

});
