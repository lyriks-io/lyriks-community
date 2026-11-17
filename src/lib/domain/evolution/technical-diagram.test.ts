import { describe, expect, it } from 'vitest';
import {
	describeTechnicalDiagram,
	readTechnicalDiagram,
	sequenceParticipants,
	technicalDiagramCounts,
	technicalDiagramProblems,
	technicalDiagramWords,
	writeTechnicalDiagram
} from './technical-diagram';
import { addMessage, addTechElement, removeTechElement, renameTechElement, updateTechElement } from './technical-diagram-edits';
import { answerStepAct, redrawDiagramAct, updateStepDescriptionAct, validateStepAct, writeTextFromDiagramAct, type ActContext, type ActOutcome } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { diagramBehindTexts, textsBehindDiagram } from './functional-sync';
import { coachOf } from './coach';
import { readPath } from './path';

/**
 * The Technical spec's diagram (ac-evo-tech-uml, -sync): what the change
 * involves and adds to the architecture, and who calls whom, kept as words
 * arranged and paired with the step's description.
 */
const SMS = `actor Baker
component Order service
component SMS sender: new
store Orders
store SMS deliveries: new
system SMS provider: new

link Order service -> SMS sender: asks for a text when a bag is ready
link SMS sender -> SMS provider: sends the text over HTTPS
link SMS sender -> SMS deliveries: records each attempt

note SMS provider: 0.05 € per text; never more than one per order
note Orders: the phone number is personal data, used for this text only

sequence Mark a bag ready
  Baker -> Order service: marks the bag ready
  Order service -> SMS sender: asks for a text
  SMS sender -> SMS provider: sends the text
    goes wrong when no answer within 10 s: retried every 5 minutes for one hour, then the baker is told
  SMS provider --> SMS sender: delivered`;

describe('the technical notation reads the diagram [criterion:ac-leaf-ac-evo-tech-uml]', () => {
	it('reads the parts and what is new, the links, the notes and the sequences with their calls and answers', () => {
		const { diagram, problems } = readTechnicalDiagram(SMS);
		expect(problems).toEqual([]);
		expect(diagram.elements.filter((e) => e.isNew).map((e) => e.name)).toEqual(['SMS sender', 'SMS deliveries', 'SMS provider']);
		expect(diagram.links[1]).toEqual({ from: 'SMS sender', to: 'SMS provider', label: 'sends the text over HTTPS' });
		expect(diagram.notes[0]).toEqual({ on: 'SMS provider', text: '0.05 € per text; never more than one per order' });
		const messages = diagram.sequences[0].messages;
		expect(messages.map((m) => m.reply)).toEqual([false, false, false, true]);
		expect(messages[2].failures).toEqual([{ when: 'no answer within 10 s', then: 'retried every 5 minutes for one hour, then the baker is told' }]);
		expect(sequenceParticipants(diagram, diagram.sequences[0]).map((p) => p.name)).toEqual(['Baker', 'Order service', 'SMS sender', 'SMS provider']);
		expect(technicalDiagramCounts(diagram)).toMatchObject({ parts: 5, added: 3, links: 3, notes: 2, sequences: 1, messages: 4, failures: 1 });
	});

	it('writes it back the way it reads', () => {
		expect(writeTechnicalDiagram(readTechnicalDiagram(SMS).diagram)).toBe(SMS);
	});

	it('points out what it cannot read or what is named without being declared, and never refuses', () => {
		const { diagram, problems } = readTechnicalDiagram('component Shop\nbad line\nlink Shop -> Bank: pays\nsequence Pay\n  goes wrong when down: retried\n  Shop -> Bank: pays');
		expect(problems.map((p) => p.line)).toEqual([2, 5]);
		expect(technicalDiagramProblems(diagram).map((p) => p.message)).toEqual([
			'"Bank" is linked without being declared: add it as a component, a store, a system or an actor.'
		]);
		expect(technicalDiagramWords(SMS)).not.toMatch(/\b(component|store|system|link|note|sequence|goes wrong when)\b/);
	});

	it('says where each problem sits on the drawing: the link, the note or the message (ac-evo-tech-uml)', () => {
		const { diagram } = readTechnicalDiagram(
			'component Shop\nlink Shop -> Shop: loops\nlink Shop -> Bank: pays\nnote Ledger: append only\nsequence Pay\n  Shop -> Shop: checks\n  Shop -> Gateway: pays\n    goes wrong when down'
		);
		expect(technicalDiagramProblems(diagram).map((p) => p.at)).toEqual([
			[{ kind: 'link', index: 1 }],
			[{ kind: 'note', index: 0 }],
			[{ kind: 'message', sequence: 'Pay', index: 1 }],
			[{ kind: 'message', sequence: 'Pay', index: 1 }]
		]);
	});

	it('renames a part in every link, note and message, never makes a person new, and adds an answer after a call', () => {
		const d = readTechnicalDiagram(SMS).diagram;
		const renamed = renameTechElement(d, 'SMS provider', 'Text gateway');
		expect(renamed.links[1].to).toBe('Text gateway');
		expect(renamed.notes[0].on).toBe('Text gateway');
		expect(renamed.sequences[0].messages[2].to).toBe('Text gateway');
		expect(updateTechElement(d, 'Baker', { isNew: true }).elements[0].isNew).toBe(false);
		expect(removeTechElement(d, 'SMS provider').notes.map((n) => n.on)).toEqual(['Orders']);
		const added = addMessage(d, 'Mark a bag ready', 1);
		expect(added.diagram.sequences[0].messages[2]).toMatchObject({ from: 'SMS sender', to: 'Order service', reply: true });
		expect(addTechElement(d, 'store').name).toBe('New store');
	});
});

describe('the technical diagram and its description stay in step [criterion:ac-leaf-ac-evo-tech-uml-sync]', () => {
	it('says the parts and what is new, how they talk, each sequence and what goes wrong, then the constraints and risks', () => {
		const text = describeTechnicalDiagram(readTechnicalDiagram(SMS).diagram, 'en');
		const [inventory, talk, sequence, risks] = text.split('\n\n');
		expect(inventory).toBe('Parts: Order service, SMS sender (new); Data: Orders, SMS deliveries (new); Other systems: SMS provider (new); People: Baker.');
		expect(talk).toMatch(/^How they talk: Order service to SMS sender: asks for a text when a bag is ready; /);
		expect(sequence).toMatch(/SMS sender to SMS provider: sends the text \(If no answer within 10 s: retried every 5 minutes/);
		expect(risks).toBe(
			'Constraints and risks:\n- SMS provider: 0.05 € per text; never more than one per order.\n- Orders: the phone number is personal data, used for this text only.'
		);
		expect(describeTechnicalDiagram(readTechnicalDiagram(SMS).diagram, 'fr').split('\n\n')[0]).toMatch(/^Composants : Order service, SMS sender \(nouveau\)/);
	});

	const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
	const ai: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };
	let n = 0;
	const ctx = (actor: Actor): ActContext => ({ actor, at: `2026-10-20T16:00:${String(++n).padStart(2, '0')}.000Z`, newId: () => `t-${++n}`, soloWorkspace: false });
	const ok = (outcome: ActOutcome): EvolutionRequest => {
		if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
		return outcome.request;
	};
	const open = () => createEvolutionRequest({ id: 'r2', title: 'Ready text', origin: 'customer_feedback', stage: 'specification' });

	it('leaves the description behind when saved, to update from it, and the data answer alone; falls behind when the description moves', () => {
		let request = ok(answerStepAct(ctx(ana), open(), { step: 'technical_spec', question: 'data', answer: 'Orders keep the date the text was sent.' }));
		request = ok(answerStepAct(ctx(ana), request, { step: 'technical_spec', question: 'diagram', answer: SMS }));
		// Saving the diagram writes no text: the description falls behind it (ac-evo-func-uml-sync's rule).
		expect(request.stepDescriptions.technical_spec).toBe('');
		expect(textsBehindDiagram(request, 'technical_spec')).toEqual(['description']);
		expect(request.stepAnswers.technical_spec.data).toBe('Orders keep the date the text was sent.');
		expect(diagramBehindTexts(request, 'technical_spec')).toBe(false);
		// The Functional spec's own pairing is not touched by the Technical spec's.
		expect(diagramBehindTexts(request, 'functional_spec')).toBe(false);
		expect(textsBehindDiagram(request, 'functional_spec')).toEqual([]);
		const behindFacts = { path: readPath(request, { questionsOwed: 0, pendingProposals: 0 }), pendingProposals: 0, questionsOwed: 0, gate: { ok: true, reason: null }, collisions: 0, frictions: 0, undecidedLines: 0, solo: true };
		expect(coachOf(request, behindFacts).then[0]).toMatch(
			/^The Technical spec's diagram changed what one of its texts says \(description\): rewrite it from the diagram first, write_text_from_diagram \{step: "technical_spec", question: "description", answer\}/
		);
		request = ok(writeTextFromDiagramAct(ctx(ai), request, { step: 'technical_spec', question: 'description', answer: describeTechnicalDiagram(readTechnicalDiagram(SMS).diagram, 'en') }));
		expect(request.stepDescriptions.technical_spec).toMatch(/^Parts: Order service, SMS sender \(new\)/);
		expect(textsBehindDiagram(request, 'technical_spec')).toEqual([]);
		expect(diagramBehindTexts(request, 'technical_spec')).toBe(false);
		request = ok(updateStepDescriptionAct(ctx(ana), request, { step: 'technical_spec', description: 'Texts go through our SMS provider.' }));
		expect(diagramBehindTexts(request, 'technical_spec')).toBe(true);
		expect(readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'technical_spec')?.detail).toBe(
			'Written; the diagram is behind the description, to redraw from it.'
		);
		expect((validateStepAct(ctx(ana), request, 'technical_spec') as { reason?: string }).reason).toBe(
			'The diagram is behind the texts of the Technical spec: it is being redrawn from them.'
		);
		const facts = { path: readPath(request, { questionsOwed: 0, pendingProposals: 0 }), pendingProposals: 0, questionsOwed: 0, gate: { ok: true, reason: null }, collisions: 0, frictions: 0, undecidedLines: 0, solo: true };
		expect(coachOf(request, facts).then[0]).toMatch(/^Redraw the Technical spec's diagram from its description first: redraw_diagram \{step: "technical_spec", diagram\}/);
		request = ok(redrawDiagramAct(ctx(ai), request, { step: 'technical_spec', diagram: SMS }));
		expect(request.stepDescriptions.technical_spec).toBe('Texts go through our SMS provider.');
		expect(diagramBehindTexts(request, 'technical_spec')).toBe(false);
		expect(validateStepAct(ctx(ana), request, 'technical_spec').ok).toBe(true);
	});
});
