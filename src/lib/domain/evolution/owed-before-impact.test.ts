import { describe, expect, it } from 'vitest';
import { carriesAChange, isOwedBeforeImpact, readableAtImpact } from './owed-before-impact';
import { answerStepAct, askQuestionAct, crossStageAct, redrawDiagramAct, resolveQuestionAct, runCoherenceAct, updateNeedAct, updateStepDescriptionAct, validateFieldAct, validateStepAct, type ActContext, type ActOutcome } from './acts';
import { coachOf, type CoachFacts } from './coach';
import { createDraftLeaf, createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { readPath, requiredTextsEmpty, specStepsWritten } from './path';
import { readFunctionalDiagram } from './functional-diagram';
import { journeyPaths } from './journey-paths';

/**
 * EVO-013: before its Impact analysis a request owes its Need (current
 * situation and objectives) and the Solution's description; what it changes is
 * carried by its drafts. The Solution's examples, the Functional spec and the
 * Technical spec are offered, never owed.
 */
const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let counter = 0;
const ctx: ActContext = { actor: ana, at: '2026-11-20T10:00:00.000Z', newId: () => `id-${++counter}`, soloWorkspace: false };
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

/** The three owed texts written and one draft carried; everything offered left empty. */
const owedWritten = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
	const base = createEvolutionRequest({ id: 'r1', title: 'Owe less', origin: 'internal_idea', status: 'open', stage: 'specification' });
	return {
		...base,
		need: { ...base.need, situation: 'Six texts and two diagrams are owed before the readings.', objectives: 'Owe the Need and the Solution only.' },
		stepDescriptions: { ...base.stepDescriptions, solution: 'A request owes its Need and what the Solution changes.' },
		drafts: [createDraftLeaf({ id: 'draft:d1', kind: 'amend', baseLeafId: 'feat-31' })],
		...over
	};
};
const pathOf = (request: EvolutionRequest) => readPath(request, { questionsOwed: 0, pendingProposals: 0 });
const progressOf = (request: EvolutionRequest, step: string) => pathOf(request).find((s) => s.step === step)!;

describe('a request enters the Impact analysis on its own once what it owes is written and it carries a change, written specs or not [criterion:ac-leaf-80349d4a-ab91-457c-b721-6745c5cf9015]', () => {
	it('is readable at the Impact analysis with its Functional spec and its Technical spec empty', () => {
		expect(readableAtImpact(owedWritten())).toBe(true);
	});

	it('is readable with its Functional spec and its Technical spec written too, no diagram drawn', () => {
		const base = owedWritten();
		const written = owedWritten({
			stepDescriptions: { ...base.stepDescriptions, functional_spec: 'The person writes the Need, then the Solution.', technical_spec: 'readyForImpact asks for a draft.' },
			stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, refusals: 'Nothing drafted: it stays in Specify.' } }
		});
		expect(readableAtImpact(written)).toBe(true);
	});

	it('stays in Specify while the Need\'s situation, its objectives or the Solution\'s description is empty', () => {
		const base = owedWritten();
		expect(readableAtImpact(owedWritten({ need: { ...base.need, situation: '' } }))).toBe(false);
		expect(readableAtImpact(owedWritten({ need: { ...base.need, objectives: '' } }))).toBe(false);
		expect(readableAtImpact(owedWritten({ stepDescriptions: { ...base.stepDescriptions, solution: '' } }))).toBe(false);
	});

	it('stays in Specify while it carries nothing that changes the product, and a draft, a data, page, rule or finding change each is enough', () => {
		const nothing = owedWritten({ drafts: [] });
		expect(specStepsWritten(nothing)).toBe(true);
		expect(carriesAChange(nothing)).toBe(false);
		expect(readableAtImpact(nothing)).toBe(false);
		for (const change of [
			{ drafts: [createDraftLeaf({ id: 'draft:d2' })] },
			{ dataDrafts: [{ id: 'data:1' } as never] },
			{ sectionDrafts: [{ id: 'section:1' } as never] },
			{ ruleDrafts: [{ id: 'rules:1' } as never] },
			{ findingDrafts: [{ id: 'finding:1' } as never] }
		])
			expect(readableAtImpact({ ...nothing, ...change })).toBe(true);
	});

	it('is never readable once it is no longer open', () => {
		expect(readableAtImpact(owedWritten({ status: 'cancelled' }))).toBe(false);
	});

	it('a text of the Functional or the Technical spec written and then emptied holds nothing', () => {
		const written = ok(updateStepDescriptionAct(ctx, owedWritten(), { step: 'functional_spec', description: 'The person drafts at once.' }));
		const emptied = ok(updateStepDescriptionAct(ctx, written, { step: 'functional_spec', description: '' }));
		expect(progressOf(emptied, 'functional_spec')).toMatchObject({ progress: 'done', detail: 'Optional: nothing written.' });
		expect(readableAtImpact(emptied)).toBe(true);
		const technical = ok(updateStepDescriptionAct(ctx, owedWritten(), { step: 'technical_spec', description: 'One helper module.' }));
		expect(readableAtImpact(ok(updateStepDescriptionAct(ctx, technical, { step: 'technical_spec', description: '' })))).toBe(true);
	});

});

describe('only a diagram once drawn and left behind its texts holds the entry into the Impact analysis; a spec written with no diagram drawn holds nothing [criterion:ac-leaf-70ed474b-7483-4f95-99b0-4e6f12f929e4]', () => {
	const describedFunctional = () => {
		const base = owedWritten();
		return owedWritten({ stepDescriptions: { ...base.stepDescriptions, functional_spec: 'The person drafts at once.' } });
	};

	it('a Functional spec written with no diagram drawn holds nothing', () => {
		expect(progressOf(describedFunctional(), 'functional_spec')).toMatchObject({ progress: 'done', detail: 'Written.' });
		expect(readableAtImpact(describedFunctional())).toBe(true);
	});

	it('a Technical spec written with no diagram drawn holds nothing', () => {
		const base = owedWritten();
		const technical = owedWritten({ stepDescriptions: { ...base.stepDescriptions, technical_spec: 'One helper module.' } });
		expect(readableAtImpact(technical)).toBe(true);
	});

	it('a diagram drawn and in step with its texts holds nothing', () => {
		const drawn = ok(redrawDiagramAct({ ...ctx, actor: { ...ana, kind: 'ai_client', channel: 'ai_client' } }, describedFunctional(), { diagram: 'actor Person\nuse case Draft a change: Person' }));
		expect(readableAtImpact(drawn)).toBe(true);
	});

	it('a diagram drawn and left behind its texts holds the entry until it is redrawn', () => {
		const ai: Actor = { ...ana, kind: 'ai_client', channel: 'ai_client' };
		const drawn = ok(redrawDiagramAct({ ...ctx, actor: ai }, describedFunctional(), { diagram: 'actor Person\nuse case Draft a change: Person' }));
		const behind = ok(updateStepDescriptionAct(ctx, drawn, { step: 'functional_spec', description: 'The person drafts at once, then reads the impact.' }));
		expect(progressOf(behind, 'functional_spec').progress).toBe('in_progress');
		expect(readableAtImpact(behind)).toBe(false);
		const redrawn = ok(redrawDiagramAct({ ...ctx, actor: ai }, behind, { diagram: 'actor Person\nuse case Draft a change: Person\nuse case Read the impact: Person' }));
		expect(readableAtImpact(redrawn)).toBe(true);
	});

	it('a diagram drawn and left behind its texts holds the validation of its step', () => {
		const base = owedWritten();
		const behind = owedWritten({
			stepDescriptions: { ...base.stepDescriptions, functional_spec: 'The person drafts at once.' },
			stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Person\nuse case Draft a change: Person' } }
		});
		expect(progressOf(behind, 'functional_spec').progress).toBe('in_progress');
		expect(reasonOf(validateStepAct(ctx, behind, 'functional_spec'))).not.toBe('');
	});
});

describe('a question asked of the request on a step of specification and still open holds the entry into the Impact analysis [criterion:ac-leaf-662e7449-ceba-40f8-9696-8898a1b67ecd]', () => {
	it('holds the entry while the question is open, and lets it go once answered or set aside', () => {
		const asked = ok(askQuestionAct(ctx, owedWritten(), { step: 'solution', question: 'Which requests already in Specify move on?', why: 'They may enter at their next write.', fieldKey: null }));
		expect(readableAtImpact(asked)).toBe(false);
		const id = asked.customQuestions[0].id;
		expect(readableAtImpact(ok(resolveQuestionAct(ctx, asked, { questionId: id, resolution: 'answered', text: 'Only on the write that makes them ready.' })))).toBe(true);
		expect(readableAtImpact(ok(resolveQuestionAct(ctx, asked, { questionId: id, resolution: 'set_aside', text: 'Settled in the Technical spec.' })))).toBe(true);
	});
});

describe('a path of the journey is not validated while the use case diagram that draws it is behind its texts [criterion:ac-leaf-c1a7892d-65f9-4c20-8f49-baa2e8d368c3]', () => {
	it('a use case diagram drawn and left behind its texts holds the validation of the paths it draws', () => {
		const ai: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
		const described = ok(updateStepDescriptionAct(ctx, owedWritten(), { step: 'functional_spec', description: 'The person drafts at once.' }));
		const drawn = ok(redrawDiagramAct({ ...ctx, actor: ai }, described, { diagram: 'actor Person\nuse case Draft a change: Person\nflow Draft a change\nPerson: drafts what changes' }));
		const [path] = journeyPaths(readFunctionalDiagram(drawn.stepAnswers.functional_spec.diagram).diagram);
		expect(reasonOf(validateFieldAct(ctx, drawn, { key: path.key, liveValue: path.fingerprint }))).toBe('');
		const behind = ok(updateStepDescriptionAct(ctx, drawn, { step: 'functional_spec', description: 'The person drafts at once, then reads the impact.' }));
		expect(reasonOf(validateFieldAct(ctx, behind, { key: path.key, liveValue: path.fingerprint }))).toMatch(/diagram/i);
	});

});

describe('the Need\'s description no longer holds the Need step [criterion:ac-leaf-1866749c-167c-4004-b53e-f604bc0a763a]', () => {
	it('reads the Need done once its situation and objectives are written, its description empty or not', () => {
		const base = createEvolutionRequest({ id: 'r2', title: 'Owe less', origin: 'internal_idea', status: 'open', stage: 'specification' });
		const situationOnly = ok(updateNeedAct(ctx, base, { situation: 'Six texts are owed.' }));
		expect(progressOf(situationOnly, 'need').progress).toBe('in_progress');
		const owed = ok(updateNeedAct(ctx, situationOnly, { objectives: 'Owe the Need and the Solution only.' }));
		expect(owed.need.description).toBe('');
		expect(progressOf(owed, 'need')).toMatchObject({ progress: 'done', detail: '2 of 6 questions answered.' });
		const described = ok(updateNeedAct(ctx, owed, { description: 'Look at the evolution workflow.' }));
		expect(progressOf(described, 'need').progress).toBe('done');
	});
});

describe('the Functional spec and the Technical spec owe no text: empty, they read Optional and hold neither the Impact analysis nor the freeze [criterion:ac-leaf-e5ba6571-f7b3-44e0-af63-03c41cfcf461]', () => {
	it('reads both Optional and done while nothing is written on them', () => {
		const request = owedWritten();
		expect(progressOf(request, 'functional_spec')).toMatchObject({ progress: 'done', detail: 'Optional: nothing written.' });
		expect(progressOf(request, 'technical_spec')).toMatchObject({ progress: 'done', detail: 'Optional: nothing written.' });
		expect(requiredTextsEmpty(request, 'functional_spec')).toEqual([]);
	});

	it('does not hold the Impact analysis', () => {
		expect(specStepsWritten(owedWritten())).toBe(true);
		expect(pathOf(owedWritten()).find((s) => s.current)?.step).toBe('impact_analysis');
	});

	it('does not hold the freeze', () => {
		const entered = ok(crossStageAct(ctx, owedWritten(), { criticalEmptyCount: 0 }));
		const read = ok(runCoherenceAct(ctx, entered, { report: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: ctx.at }, findings: [] }));
		const frozen = ok(crossStageAct(ctx, read, { criticalEmptyCount: 0, specification: { total: 0, validated: 0 } }));
		expect(frozen.stage).toBe('implementation');
		expect(frozen.stepDescriptions.functional_spec).toBe('');
		expect(frozen.stepDescriptions.technical_spec).toBe('');
	});
});

describe('the Solution owes its description only; how we will know it works is offered [criterion:ac-leaf-c1db73b7-2455-491d-a5ad-3bfbf20a49de]', () => {
	it('owes its description while it is empty, and nothing once it is written', () => {
		const base = owedWritten();
		const blank = owedWritten({ stepDescriptions: { ...base.stepDescriptions, solution: '' } });
		expect(requiredTextsEmpty(blank, 'solution')).toEqual(['step.solution.description']);
		expect(requiredTextsEmpty(owedWritten(), 'solution')).toEqual([]);
		expect(progressOf(owedWritten(), 'solution')).toMatchObject({ progress: 'done', detail: 'Written.' });
	});

	it('takes its examples when they are written, and is validated without them', () => {
		const withExamples = ok(answerStepAct(ctx, owedWritten(), { step: 'solution', question: 'examples', answer: 'EVO-009 reaches its readings with three texts.' }));
		expect(withExamples.stepAnswers.solution.examples).toBe('EVO-009 reaches its readings with three texts.');
		expect(reasonOf(validateStepAct(ctx, owedWritten(), 'solution'))).toBe('');
		expect(isOwedBeforeImpact('step.solution.examples')).toBe(false);
		expect(isOwedBeforeImpact('step.solution.description')).toBe(true);
	});
});

describe('a request whose Need\'s situation and objectives and whose Solution\'s description are written owes nothing more on the Briefing and the Solution [criterion:ac-leaf-d4f176d4-874d-4db1-b013-07e710655a0c]', () => {
	const facts = (request: EvolutionRequest): CoachFacts => ({
		path: pathOf(request),
		pendingProposals: 0,
		questionsOwed: 0,
		gate: { ok: true, reason: null },
		collisions: 0,
		frictions: 0,
		undecidedLines: 0,
		solo: true
	});

	it('reads the Need, the Solution, the Functional spec and the Technical spec done, the Need\'s description and other answers left empty', () => {
		const request = owedWritten();
		expect(request.need.description).toBe('');
		for (const step of ['need', 'solution', 'functional_spec', 'technical_spec']) expect(progressOf(request, step).progress).toBe('done');
	});

	it('names exactly what is owed: the Need\'s situation and objectives and the Solution\'s description', () => {
		for (const path of ['00-need.situation', '00-need.objectives', 'step.solution.description']) expect(isOwedBeforeImpact(path)).toBe(true);
		for (const path of ['00-need.description', '00-need.symptoms', 'step.solution.examples', 'step.functional_spec.description', 'step.functional_spec.refusals', 'step.technical_spec.description'])
			expect(isOwedBeforeImpact(path)).toBe(false);
	});

	it('the coach asks nothing more of the Briefing and the Solution and goes on to what the change touches', () => {
		const request = owedWritten({ drafts: [] });
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		expect(next.ask).toEqual([]);
		expect(next.then.join(' ')).toContain('add_draft_leaf');
	});
});
