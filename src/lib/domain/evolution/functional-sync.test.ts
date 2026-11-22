import { describe, expect, it } from 'vitest';
import {
	answerStepAct,
	redrawDiagramAct,
	updateStepDescriptionAct,
	validateFieldAct,
	validateStepAct,
	skipQuestionAct,
	writeTextFromDiagramAct,
	type ActContext,
	type ActOutcome
} from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import {
	behindSince,
	describeFunctionalDiagram,
	diagramBehindTexts,
	functionalTexts,
	FUNCTIONAL_DIAGRAM_FIELD,
	FUNCTIONAL_TEXT_KEYS,
	textsBehindDiagram
} from './functional-sync';
import { readFunctionalDiagram } from './functional-diagram';
import { readPath } from './path';
import { latestVersion } from './field-versions';
import { followUpClicks, startSession } from './live-session';

/**
 * The texts of the Functional spec and its diagram never say two things
 * without the act that catches one up being due (ac-evo-func-uml-sync): saving
 * the diagram writes no text, and each text whose part of it changed falls
 * behind it until an AI or the person rewrites it from the diagram; a text
 * written leaves the diagram behind until an AI or the person redraws it;
 * nobody validates the step in between.
 */
const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const ai: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
let counter = 0;
let clock = 0;
const ctxFor = (actor: Actor, lang: 'en' | 'fr' = 'en'): ActContext => ({
	actor,
	at: `2026-10-20T10:00:${String(++clock).padStart(2, '0')}.000Z`,
	newId: () => `id-${++counter}`,
	soloWorkspace: false,
	lang
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);

const DIAGRAM = `actor Baker
system SMS provider

use case Mark a bag ready: Baker, SMS provider

flow Mark a bag ready
  Baker: marks the bag ready
  Product: sends one text with the pickup slot
    refused when the order has no phone number: the baker sees "no number on file"
    goes wrong when the SMS provider is down: the text is retried for an hour

states Order
  placed -> ready: Mark a bag ready`;

const open = (): EvolutionRequest => createEvolutionRequest({ id: 'r1', title: 'Ready text', origin: 'customer_feedback', stage: 'specification' });
const TEXT_BEHIND = 'A text of the Functional spec is behind its diagram: it is being updated from it.';
const saveDiagram = (request: EvolutionRequest, notation = DIAGRAM) =>
	ok(answerStepAct(ctxFor(ana), request, { step: 'functional_spec', question: 'diagram', answer: notation }));
/** What the person's AI does for each text left behind: writes it from the diagram, here in the platform's own words. */
function writeFromDiagram(request: EvolutionRequest, notation = DIAGRAM): EvolutionRequest {
	const said = describeFunctionalDiagram(readFunctionalDiagram(notation).diagram);
	return textsBehindDiagram(request).reduce(
		(r, question) => ok(writeTextFromDiagramAct(ctxFor(ai), r, { step: 'functional_spec', question, answer: said[question as keyof typeof said] })),
		request
	);
}

describe('the diagram leaves behind the texts it changes [criterion:ac-leaf-ac-evo-func-uml-sync]', () => {
	it('writes no text when saved: each text whose part of the diagram changed falls behind it, and is not written by hand', () => {
		const saved = saveDiagram(open());
		expect(functionalTexts(saved)).toEqual({ description: '', refusals: '', failures: '' });
		expect(textsBehindDiagram(saved)).toEqual(['description', 'refusals', 'failures']);
		expect(diagramBehindTexts(saved)).toBe(false);
		expect(reasonOf(answerStepAct(ctxFor(ana), saved, { step: 'functional_spec', question: 'refusals', answer: 'Never two texts for one order.' }))).toBe(TEXT_BEHIND);
		expect(reasonOf(updateStepDescriptionAct(ctxFor(ana), saved, { step: 'functional_spec', description: 'My own words.' }))).toBe(TEXT_BEHIND);
	});

	it('has each text rewritten from the diagram by an AI, as a version written from it, which leaves the pair in step', () => {
		const written = writeFromDiagram(saveDiagram(open()));
		expect(written.stepDescriptions.functional_spec).toBe(
			[
				'Who takes part: Baker; other systems: SMS provider.',
				'Mark a bag ready (Baker, SMS provider): Baker marks the bag ready. The product sends one text with the pickup slot.',
				'Order: starts placed; placed to ready when Mark a bag ready.'
			].join('\n\n')
		);
		expect(written.stepAnswers.functional_spec.refusals).toBe(
			'Mark a bag ready, "sends one text with the pickup slot": refused when the order has no phone number; then the baker sees "no number on file".'
		);
		expect(written.stepAnswers.functional_spec.failures).toBe(
			'Mark a bag ready, "sends one text with the pickup slot": goes wrong when the SMS provider is down; then the text is retried for an hour.'
		);
		expect(written.fieldVersions.filter((v) => Object.values(FUNCTIONAL_TEXT_KEYS).includes(v.key as never)).map((v) => v.source)).toEqual(['diagram', 'diagram', 'diagram']);
		expect(textsBehindDiagram(written)).toEqual([]);
		expect(diagramBehindTexts(written)).toBe(false);
		expect(reasonOf(writeTextFromDiagramAct(ctxFor(ai), written, { step: 'functional_spec', question: 'refusals', answer: 'Again.' }))).toBe(
			'This text already says what the diagram says: there is nothing to update.'
		);
	});

	it('leaves behind only the text whose part of the diagram changed', () => {
		const written = writeFromDiagram(saveDiagram(open()));
		const other = DIAGRAM.replace('the order has no phone number', 'the customer refused texts');
		const edited = saveDiagram(written, other);
		expect(textsBehindDiagram(edited)).toEqual(['refusals']);
		expect(edited.stepAnswers.functional_spec.refusals).toBe(written.stepAnswers.functional_spec.refusals);
		expect(readPath(edited, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'functional_spec')?.detail).toBe(
			'Written; the diagram changed a text, to update from it.'
		);
	});

	it('writes them in French in a French spec', () => {
		const texts = describeFunctionalDiagram(readFunctionalDiagram(DIAGRAM).diagram, 'fr');
		expect(texts.description.split('\n\n')[0]).toBe('Qui participe : Baker ; autres systèmes : SMS provider.');
		expect(texts.refusals).toBe(
			'Mark a bag ready, « sends one text with the pickup slot » : refusé quand the order has no phone number ; alors the baker sees "no number on file".'
		);
	});

	it('names who takes part in a use case only when someone does, and walks a flow drawn for a use case never declared', () => {
		const texts = describeFunctionalDiagram(
			readFunctionalDiagram(`use case Close the day

flow Count the till
  Baker: counts the till`).diagram
		);
		expect(texts.description.split('\n\n')).toEqual(['Close the day: no flow drawn yet.', 'Count the till: Baker counts the till.']);
	});

	it('leaves the texts as they are when the diagram drawn is empty', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready.' }));
		const cleared = ok(answerStepAct(ctxFor(ana), described, { step: 'functional_spec', question: 'diagram', answer: 'nothing readable here' }));
		expect(cleared.stepDescriptions.functional_spec).toBe('The baker marks the bag ready.');
	});
});

describe('a text leaves the diagram behind until it is redrawn [criterion:ac-leaf-ac-evo-func-uml-sync]', () => {
	it('is behind as soon as a text moves, says since when, and the step says so', () => {
		const written = writeFromDiagram(saveDiagram(open()));
		const ctx = ctxFor(ana);
		const moved = ok(answerStepAct(ctx, written, { step: 'functional_spec', question: 'refusals', answer: 'Never two texts for one order.' }));
		expect(diagramBehindTexts(moved)).toBe(true);
		expect(behindSince(moved)).toBe(ctx.at);
		expect(readPath(moved, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'functional_spec')?.detail).toBe(
			'Written; the diagram is behind the texts, to redraw from them.'
		);
	});

	it('is behind a first description with no diagram yet, and never behind empty texts', () => {
		expect(diagramBehindTexts(open())).toBe(false);
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready.' }));
		expect(diagramBehindTexts(described)).toBe(true);
	});

	it('is caught up by a redraw that rewrites no text, and a diagram that follows is not redrawn', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready; the customer gets a text.' }));
		const redrawn = ok(redrawDiagramAct(ctxFor(ai), described, { diagram: DIAGRAM }));
		expect(redrawn.stepDescriptions.functional_spec).toBe('The baker marks the bag ready; the customer gets a text.');
		expect(redrawn.stepAnswers.functional_spec.diagram).toBe(DIAGRAM);
		expect(diagramBehindTexts(redrawn)).toBe(false);
		expect(reasonOf(redrawDiagramAct(ctxFor(ai), redrawn, { diagram: DIAGRAM }))).toBe('The diagram already follows the texts: edit it instead.');
	});

	it('takes a diagram edited while behind as the source: the texts it changes fall behind it, their words kept in their versions', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'My own words.' }));
		const edited = saveDiagram(described);
		expect(edited.stepDescriptions.functional_spec).toBe('My own words.');
		expect(diagramBehindTexts(edited)).toBe(false);
		expect(textsBehindDiagram(edited)).toContain('description');
		const rewritten = ok(
			writeTextFromDiagramAct(ctxFor(ai), edited, { step: 'functional_spec', question: 'description', answer: 'My own words: the baker marks the bag ready, the product texts the slot.' })
		);
		expect(rewritten.fieldVersions.filter((v) => v.key === FUNCTIONAL_TEXT_KEYS.description).map((v) => v.value)).toEqual([
			'My own words.',
			'My own words: the baker marks the bag ready, the product texts the slot.'
		]);
		expect(textsBehindDiagram(rewritten)).not.toContain('description');
	});

	it('is never behind once the diagram is skipped on purpose', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready.' }));
		const skipped = ok(skipQuestionAct(ctxFor(ana), described, { fieldPath: FUNCTIONAL_DIAGRAM_FIELD, leafId: null, reason: 'One screen, nothing to draw.', liveValue: '' }));
		expect(diagramBehindTexts(skipped)).toBe(false);
	});
});

describe('nobody validates texts and a diagram that say two things [criterion:ac-leaf-ac-evo-func-uml-sync]', () => {
	it('refuses to validate the Functional spec while a text is behind the diagram', () => {
		const written = writeFromDiagram(saveDiagram(open()));
		const edited = saveDiagram(written, DIAGRAM.replace('the order has no phone number', 'the customer refused texts'));
		expect(reasonOf(validateStepAct(ctxFor(ana), edited, 'functional_spec'))).toBe(TEXT_BEHIND);
		expect(reasonOf(validateFieldAct(ctxFor(ana), edited, { key: FUNCTIONAL_TEXT_KEYS.refusals, liveValue: edited.stepAnswers.functional_spec.refusals ?? '' }))).toBe(TEXT_BEHIND);
	});

	it('refuses to validate the Functional spec or its diagram while the diagram is behind', () => {
		const written = writeFromDiagram(saveDiagram(open()));
		const moved = ok(updateStepDescriptionAct(ctxFor(ana), written, { step: 'functional_spec', description: 'Rewritten by hand.' }));
		expect(reasonOf(validateStepAct(ctxFor(ana), moved, 'functional_spec'))).toBe('The diagram is behind the texts of the Functional spec: it is being redrawn from them.');
		expect(reasonOf(validateFieldAct(ctxFor(ana), moved, { key: FUNCTIONAL_DIAGRAM_FIELD, liveValue: DIAGRAM }))).toBe(
			'The diagram is behind the texts of the Functional spec: it is being redrawn from them.'
		);
		const caughtUp = ok(redrawDiagramAct(ctxFor(ai), moved, { diagram: DIAGRAM }));
		expect(validateStepAct(ctxFor(ana), caughtUp, 'functional_spec').ok).toBe(true);
	});
});

describe('a person catches either side up by hand, with no AI [criterion:ac-leaf-ac-evo-func-uml-sync]', () => {
	it('draws by hand a diagram behind a new description: it catches up and the description stays as written [unspa:15499bfb:b0483e8e:f806fa8e]', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready.' }));
		expect(diagramBehindTexts(described)).toBe(true);
		const drawn = ok(redrawDiagramAct(ctxFor(ana), described, { diagram: DIAGRAM }));
		expect(diagramBehindTexts(drawn)).toBe(false);
		expect(textsBehindDiagram(drawn)).toEqual([]);
		expect(drawn.stepDescriptions.functional_spec).toBe('The baker marks the bag ready.');
		expect(latestVersion(drawn, FUNCTIONAL_DIAGRAM_FIELD)).toMatchObject({ by: 'ana', byKind: 'person' });
	});

	it('writes by hand the description a diagram drawn first left behind: both say the same again [unspa:15499bfb:5193dcac:1a06f017]', () => {
		const drawnFirst = saveDiagram(open());
		expect(textsBehindDiagram(drawnFirst)).toContain('description');
		const written = ok(
			writeTextFromDiagramAct(ctxFor(ana), drawnFirst, { question: 'description', answer: 'The baker marks the bag ready and the customer gets one text.' })
		);
		expect(textsBehindDiagram(written)).not.toContain('description');
		expect(diagramBehindTexts(written)).toBe(false);
	});

	it('keeps a text behind the diagram as it was when the person says it still holds', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'The baker marks the bag ready.' }));
		const followed = ok(redrawDiagramAct(ctxFor(ana), described, { diagram: DIAGRAM }));
		const moved = saveDiagram(followed, `${DIAGRAM}\nactor Customer`);
		expect(textsBehindDiagram(moved)).toContain('description');
		const kept = ok(writeTextFromDiagramAct(ctxFor(ana), moved, { question: 'description', answer: 'The baker marks the bag ready.' }));
		expect(textsBehindDiagram(kept)).not.toContain('description');
		expect(kept.stepDescriptions.functional_spec).toBe('The baker marks the bag ready.');
	});
});

describe('in a session, the texts and the diagram follow each other [criterion:ac-leaf-ac-evo-live-follow] [criterion:99cfd796]', () => {
	const withSession = (): EvolutionRequest => {
		const outcome = startSession(open(), ana.id, 's1', '2026-10-20T09:00:00.000Z');
		if (!outcome.ok) throw new Error(outcome.reason);
		return outcome.request;
	};
	const drawClicks = (request: EvolutionRequest) => (request.aiClicks ?? []).filter((c) => c.kind === 'draw');

	/** A drawn diagram, in step with the description it was drawn from. */
	const drawnInSession = (): EvolutionRequest =>
		ok(redrawDiagramAct(ctxFor(ai), ok(updateStepDescriptionAct(ctxFor(ana), withSession(), { step: 'functional_spec', description: 'The baker marks a bag ready.' })), { diagram: 'actor Baker\nuse case Mark a bag ready: Baker' }));

	it('a text written leaves a drawn diagram behind: one Draw click goes to the AI, sent by the page', () => {
		const before = drawnInSession();
		const after = ok(updateStepDescriptionAct(ctxFor(ana), before, { step: 'functional_spec', description: 'The baker marks a bag ready and the customer gets a text.' }));
		const followed = followUpClicks(before, after, ana.id, '2026-10-20T10:01:00.000Z', () => 'f1');
		expect(drawClicks(followed)).toMatchObject([{ id: 'f1', step: 'functional_spec', state: 'waiting', follow: true }]);
		// A second write while it waits sends no other.
		const again = ok(updateStepDescriptionAct(ctxFor(ana), followed, { step: 'functional_spec', description: 'The baker marks a bag ready; the customer gets one text.' }));
		expect(drawClicks(followUpClicks(followed, again, ana.id, '2026-10-20T10:02:00.000Z', () => 'f2'))).toHaveLength(1);
	});

	it('a text written while no diagram is drawn sends no Draw click: the diagram is offered, never owed [criterion:ac-leaf-57e3e39f-60c6-4dc9-8977-ac566e4da0e4]', () => {
		const before = withSession();
		const after = ok(updateStepDescriptionAct(ctxFor(ana), before, { step: 'functional_spec', description: 'The baker marks a bag ready and the customer gets a text.' }));
		expect(drawClicks(followUpClicks(before, after, ana.id, '2026-10-20T10:01:30.000Z', () => 'f0'))).toEqual([]);
	});

	it('the diagram edited leaves texts behind: the Draw click catches them up', () => {
		const described = ok(updateStepDescriptionAct(ctxFor(ana), withSession(), { step: 'functional_spec', description: 'Someone marks bags.' }));
		const drawn = writeFromDiagram(ok(redrawDiagramAct(ctxFor(ai), described, { diagram: DIAGRAM })));
		const edited = saveDiagram(drawn, DIAGRAM.replace('marks the bag ready', 'scans the bag'));
		expect(textsBehindDiagram(edited).length).toBeGreaterThan(0);
		expect(drawClicks(followUpClicks(drawn, edited, ana.id, '2026-10-20T10:03:00.000Z', () => 'f3'))).toMatchObject([{ step: 'functional_spec', follow: true }]);
	});

	it('back in step, the click still waiting is taken back; without a session nothing is sent', () => {
		const before = drawnInSession();
		const written = ok(updateStepDescriptionAct(ctxFor(ana), before, { step: 'functional_spec', description: 'The baker marks a bag ready and texts the customer.' }));
		const followed = followUpClicks(before, written, ana.id, '2026-10-20T10:04:00.000Z', () => 'f4');
		const redrawn = ok(redrawDiagramAct(ctxFor(ai), followed, { diagram: DIAGRAM }));
		expect(drawClicks(followUpClicks(followed, redrawn, ana.id, '2026-10-20T10:05:00.000Z', () => 'f5'))).toMatchObject([{ id: 'f4', state: 'withdrawn' }]);
		const alone = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'functional_spec', description: 'x' }));
		expect(drawClicks(followUpClicks(open(), alone, ana.id, '2026-10-20T10:06:00.000Z', () => 'f6'))).toEqual([]);
	});
});
