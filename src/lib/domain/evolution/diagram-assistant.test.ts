import { describe, expect, it } from 'vitest';
import { redrawDiagramAct, updateStepDescriptionAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { checkDrawing, diagramAssistantPrompt, diagramAssistantRetry, notationOfAnswer } from './diagram-assistant';
import { diagramBehindTexts, FUNCTIONAL_DIAGRAM_FIELD } from './functional-sync';

/**
 * What the built-in assistant is asked, and the check its drawing passes
 * before anything is written (ac-evo-diagram-assistant).
 */
const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
let counter = 0;
const ctxFor = (actor: Actor): ActContext => ({ actor, at: `2026-10-20T10:00:0${++counter % 10}.000Z`, newId: () => `id-${++counter}`, soloWorkspace: false, lang: 'en' });
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};

const DRAWING = `actor Baker
system SMS provider

use case Mark a bag ready: Baker, SMS provider

flow Mark a bag ready
  Baker: marks the bag ready
  Product: sends one text with the pickup slot`;

describe('the built-in assistant draws from the texts [criterion:ac-leaf-ac-evo-diagram-assistant]', () => {
	it("asks for the step's notation, with the texts, the diagram as it stands and the spec's language", () => {
		const prompt = diagramAssistantPrompt({
			step: 'functional_spec',
			texts: { description: 'The baker marks a bag ready and the customer gets a text.', refusals: 'No text without a phone number.', failures: '' },
			current: 'actor Baker',
			productName: 'La Fournée',
			lang: 'fr'
		});
		expect(prompt.system).toContain('use case <Name>');
		expect(prompt.system).toContain('Answer with the notation and nothing else');
		expect(prompt.system).toContain('in French; the keywords of the notation stay in English');
		expect(prompt.prompt).toContain('La Fournée');
		expect(prompt.prompt).toContain('The baker marks a bag ready');
		expect(prompt.prompt).toContain('No text without a phone number.');
		// An empty text is not sent as if it said something.
		expect(prompt.prompt).not.toContain('<failures');
		expect(prompt.prompt).toContain('<diagram>\nactor Baker\n</diagram>');

		const technical = diagramAssistantPrompt({ step: 'technical_spec', texts: { description: 'An SMS sender calls the provider.' }, current: '', productName: 'La Fournée', lang: 'en' });
		expect(technical.system).toContain('link <From> -> <To>');
		expect(technical.prompt).toContain('There is no diagram yet: draw it.');
	});

	it('reads a drawing through a code fence, and asks again with what was wrong', () => {
		expect(notationOfAnswer('Here it is:\n```text\nactor Baker\n```\nDone.')).toBe('actor Baker');
		expect(notationOfAnswer('  actor Baker \n')).toBe('actor Baker');
		const first = diagramAssistantPrompt({ step: 'functional_spec', texts: { description: 'x' }, current: '', productName: 'P', lang: 'en' });
		const retry = diagramAssistantRetry(first, 'actr Baker', checkDrawing('functional_spec', 'actr Baker').problems);
		expect(retry.system).toBe(first.system);
		expect(retry.prompt).toContain('<previous>\nactr Baker\n</previous>');
		expect(retry.prompt).toContain('line 1: Not read');
	});

	it('writes nothing that does not read: an unread line or an empty answer never reaches the request', () => {
		expect(checkDrawing('functional_spec', DRAWING)).toMatchObject({ reads: true, clean: true });
		expect(checkDrawing('functional_spec', 'actr Baker').reads).toBe(false);
		expect(checkDrawing('functional_spec', '').reads).toBe(false);
		// A name drawn without being declared is pointed out, worth a second try, and still reads.
		const undeclared = checkDrawing('functional_spec', 'use case Order: Customer');
		expect(undeclared).toMatchObject({ reads: true, clean: false });
		expect(checkDrawing('technical_spec', 'component Order service\nlink Order service -> SMS: sends')).toMatchObject({ reads: true, clean: false });
		expect(checkDrawing('technical_spec', 'component Order service')).toMatchObject({ reads: true, clean: true });
	});

	it("lands as the person's act through the built-in assistant, the diagram caught up and no text rewritten", () => {
		const described = ok(
			updateStepDescriptionAct(ctxFor(ana), createEvolutionRequest({ id: 'r1', title: 'Ready text', origin: 'customer_feedback', stage: 'specification' }), {
				step: 'functional_spec',
				description: 'The baker marks a bag ready and the customer gets a text.'
			})
		);
		expect(diagramBehindTexts(described)).toBe(true);
		const drawn = ok(redrawDiagramAct(ctxFor({ ...ana, channel: 'assistant' }), described, { diagram: DRAWING, step: 'functional_spec' }));
		expect(diagramBehindTexts(drawn)).toBe(false);
		expect(drawn.stepDescriptions.functional_spec).toBe('The baker marks a bag ready and the customer gets a text.');
		const version = drawn.fieldVersions.filter((v) => v.key === FUNCTIONAL_DIAGRAM_FIELD).at(-1);
		expect(version).toMatchObject({ source: 'assistant', by: 'ana' });
		expect(drawn.history.at(-1)).toMatchObject({ authorId: 'ana', authorKind: 'person', channel: 'assistant' });
	});
});
