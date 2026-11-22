import { describe, expect, it } from 'vitest';
import {
	FUNCTIONAL_DIAGRAM_KEY,
	flowLanes,
	functionalDiagramCounts,
	functionalDiagramProblems,
	functionalDiagramWords,
	readFunctionalDiagram,
	writeFunctionalDiagram
} from './functional-diagram';
import {
	addActor,
	addBranch,
	addMachine,
	addState,
	addStep,
	addTransition,
	addUseCase,
	moveStep,
	removeState,
	removeUseCase,
	renameActor,
	renameState,
	renameUseCase,
	setInitialState,
	updateStep
} from './functional-diagram-edits';
import { answerStepAct, redrawDiagramAct, updateStepDescriptionAct, type ActContext, type ActOutcome } from './acts';
import { coachOf, type CoachFacts } from './coach';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { readPath } from './path';

/**
 * The diagram of the Functional spec (ac-evo-func-uml, -edit, -text, -ai):
 * UML kept as words arranged. What these pin is that the notation reads what a
 * person or an AI client writes, writes it back the same, never refuses a line
 * it cannot read, and that an edit made on the drawing never leaves a name
 * behind.
 */
const BAKERY = `actor Baker
actor Customer
system SMS provider

use case Mark a bag ready: Baker, Customer, SMS provider
use case Collect the bag: Customer

flow Mark a bag ready
  Baker: marks the bag ready
  Product: sends one text with the pickup slot
    refused when the order has no phone number: the baker sees "no number on file"
    goes wrong when the SMS provider is down: the text is retried for an hour
  SMS provider: delivers the text
  Customer: reads the pickup slot

states Order
  placed -> ready: Mark a bag ready
  ready -> collected: the customer picks it up
  ready -> not collected: the shop closes`;

describe('the notation reads the diagram [criterion:ac-leaf-ac-evo-func-uml-text]', () => {
	it('reads who takes part, the use cases, the flows with their ways out, and the states', () => {
		const { diagram, problems } = readFunctionalDiagram(BAKERY);
		expect(problems).toEqual([]);
		expect(diagram.actors).toEqual([
			{ name: 'Baker', kind: 'person' },
			{ name: 'Customer', kind: 'person' },
			{ name: 'SMS provider', kind: 'system' }
		]);
		expect(diagram.useCases.map((u) => [u.name, u.actors])).toEqual([
			['Mark a bag ready', ['Baker', 'Customer', 'SMS provider']],
			['Collect the bag', ['Customer']]
		]);
		const flow = diagram.flows[0];
		expect(flow.steps.map((s) => s.lane)).toEqual(['Baker', 'Product', 'SMS provider', 'Customer']);
		expect(flow.steps[1].branches).toEqual([
			{ kind: 'refused', when: 'the order has no phone number', then: 'the baker sees "no number on file"' },
			{ kind: 'goes_wrong', when: 'the SMS provider is down', then: 'the text is retried for an hour' }
		]);
		expect(diagram.machines[0]).toEqual({
			object: 'Order',
			states: ['placed', 'ready', 'collected', 'not collected'],
			transitions: [
				{ from: 'placed', to: 'ready', trigger: 'Mark a bag ready' },
				{ from: 'ready', to: 'collected', trigger: 'the customer picks it up' },
				{ from: 'ready', to: 'not collected', trigger: 'the shop closes' }
			]
		});
		expect(functionalDiagramCounts(diagram)).toMatchObject({ people: 2, systems: 1, useCases: 2, steps: 4, refusals: 1, failures: 1, states: 4, transitions: 3 });
	});

	it('writes it back the way it reads, and reading what it writes changes nothing', () => {
		const once = writeFunctionalDiagram(readFunctionalDiagram(BAKERY).diagram);
		expect(once).toBe(BAKERY);
		expect(writeFunctionalDiagram(readFunctionalDiagram(once).diagram)).toBe(once);
	});

	it('keeps the state a thing starts in first, even when no transition leaves it first', () => {
		const text = 'states Order\n  draft\n  placed -> ready\n  ready -> placed: sent back\n  archived';
		const { diagram } = readFunctionalDiagram(text);
		expect(diagram.machines[0].states).toEqual(['draft', 'placed', 'ready', 'archived']);
		const written = writeFunctionalDiagram(diagram);
		expect(readFunctionalDiagram(written).diagram.machines[0].states[0]).toBe('draft');
		expect(written).toBe(text);
	});

	it('reads a name in another case as the one declared, and indentation never changes the meaning', () => {
		const { diagram } = readFunctionalDiagram('actor Baker\nuse case Bake: baker\nflow bake\nbaker: kneads\nproduct: proves');
		expect(diagram.useCases[0].actors).toEqual(['Baker']);
		expect(diagram.flows[0]).toMatchObject({ useCase: 'Bake', steps: [{ lane: 'Baker' }, { lane: 'Product' }] });
	});

	it('points out a line it cannot read with its number, and still draws the rest; nothing is refused', () => {
		const { diagram, problems } = readFunctionalDiagram('actor Baker\nthe baker bakes\nflow Bake\n  refused when no flour: nothing\n  kneads the dough\n  Baker: kneads');
		expect(problems.map((p) => p.line)).toEqual([2, 4, 5]);
		expect(problems[0].message).toMatch(/^Not read: start the line with actor, system, use case, flow, states\.$/);
		expect(diagram.flows[0].steps).toEqual([{ lane: 'Baker', text: 'kneads', branches: [] }]);
	});

	it('names what is drawn without being declared, or without anyone to do it', () => {
		const { diagram } = readFunctionalDiagram('actor Baker\nuse case Bake: Baker, Miller\nuse case Sell\nflow Bake\n  Cashier: rings it up\n  Product: prints\n    refused when nothing is in the basket');
		expect(functionalDiagramProblems(diagram).map((p) => p.message)).toEqual([
			'"Miller" takes part in "Bake" without being declared: add it as a person or a system.',
			'Nobody takes part in "Sell".',
			'"Cashier" does a step of "Bake" without being declared.',
			'A way out of "prints" does not say what then happens.'
		]);
		const lane = readFunctionalDiagram('actor Baker\nactor Customer\nuse case Bake: Baker\nflow Bake\n  Customer: waits').diagram;
		expect(functionalDiagramProblems(lane).map((p) => p.message)).toEqual(['"Customer" acts in the flow of "Bake" but does not take part in it.']);
	});

	it('points out a transition written twice between the same two states, in words of the drawing, on both arrows', () => {
		const { diagram } = readFunctionalDiagram('states Commande\n  acceptée -> en fabrication: l\'acompte est payé\n  acceptée -> annulée: rien payé en 24 heures\n  Acceptée -> en fabrication: Payer l\'acompte');
		expect(functionalDiagramProblems(diagram)).toEqual([
			{
				line: null,
				message: 'Two arrows go from "acceptée" to "en fabrication" in the states of "Commande": keep one and give it both causes.',
				// The link leads to the later arrow; both are marked.
				at: [
					{ kind: 'transition', object: 'Commande', index: 2 },
					{ kind: 'transition', object: 'Commande', index: 0 }
				]
			}
		]);
	});

	it('says where each problem sits on the drawing, so the page links to it and marks it', () => {
		const { diagram } = readFunctionalDiagram(
			'actor Baker\nuse case Bake: Baker, Miller\nuse case Sell\nflow Bake\n  Cashier: counts\n  Baker: kneads\n  Cashier: prints\n    refused when no paper\nflow Deliver\n  Product: drives'
		);
		expect(functionalDiagramProblems(diagram).map((p) => p.at)).toEqual([
			[{ kind: 'actor', name: 'Miller' }, { kind: 'use_case', name: 'Bake' }],
			[{ kind: 'use_case', name: 'Sell' }],
			// Every step of an undeclared lane is marked.
			[
				{ kind: 'step', useCase: 'Bake', index: 0 },
				{ kind: 'step', useCase: 'Bake', index: 2 }
			],
			[{ kind: 'step', useCase: 'Bake', index: 2 }],
			[{ kind: 'flow', useCase: 'Deliver' }]
		]);
	});

	it('gives the glossary the words of the diagram, never its keywords', () => {
		const words = functionalDiagramWords(BAKERY);
		expect(words).toContain('the order has no phone number');
		expect(words).toContain('SMS provider');
		expect(words).not.toMatch(/\b(actor|system|use case|flow|states|refused when|goes wrong when)\b/);
	});
});

describe('a flow is drawn in swimlanes [criterion:ac-leaf-ac-evo-func-uml]', () => {
	it('puts the people first, then the product, then the other systems, each once', () => {
		const { diagram } = readFunctionalDiagram(BAKERY);
		expect(flowLanes(diagram, diagram.flows[0])).toEqual([
			{ name: 'Baker', kind: 'person' },
			{ name: 'Customer', kind: 'person' },
			{ name: 'Product', kind: 'product' },
			{ name: 'SMS provider', kind: 'system' }
		]);
	});

	it('always has the product lane, even before the product does anything', () => {
		const { diagram } = readFunctionalDiagram('actor Baker\nuse case Bake: Baker\nflow Bake\n  Baker: kneads');
		expect(flowLanes(diagram, diagram.flows[0]).map((l) => l.name)).toEqual(['Baker', 'Product']);
	});
});

describe('the drawing is edited without leaving a name behind [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
	const bakery = () => readFunctionalDiagram(BAKERY).diagram;

	it('renames a person everywhere it is drawn, and never onto a name already taken', () => {
		const renamed = renameActor(bakery(), 'Baker', 'Shop assistant');
		expect(renamed.useCases[0].actors[0]).toBe('Shop assistant');
		expect(renamed.flows[0].steps[0].lane).toBe('Shop assistant');
		expect(renameActor(bakery(), 'Baker', 'customer')).toEqual(bakery());
		expect(renameActor(bakery(), 'Baker', '  ')).toEqual(bakery());
		expect(renameActor(bakery(), 'Baker', 'Product')).toEqual(bakery());
	});

	it('takes a use case away with its flow, and renames its flow with it', () => {
		expect(removeUseCase(bakery(), 'Mark a bag ready').flows).toEqual([]);
		expect(renameUseCase(bakery(), 'Mark a bag ready', 'Ready the bag').flows[0].useCase).toBe('Ready the bag');
	});

	it('links whoever is given a step to its use case', () => {
		const added = addActor(bakery(), 'person');
		const linked = updateStep(added.diagram, 'Mark a bag ready', 0, { lane: added.name });
		expect(linked.useCases[0].actors).toContain('New person');
		expect(functionalDiagramProblems(linked)).toEqual([]);
	});

	it('adds a step in the turn a flow takes, moves it, and gives it its ways out', () => {
		const start = readFunctionalDiagram('actor Baker\nuse case Bake: Baker').diagram;
		const first = addStep(start, 'Bake', null);
		expect(first.diagram.flows[0].steps[0].lane).toBe('Baker');
		const second = addStep(first.diagram, 'Bake', 0);
		expect(second.diagram.flows[0].steps[1].lane).toBe('Product');
		const moved = moveStep(updateStep(second.diagram, 'Bake', 1, { text: 'proves' }), 'Bake', 1, -1);
		expect(moved.flows[0].steps.map((s) => s.text)).toEqual(['proves', 'New step']);
		expect(addBranch(moved, 'Bake', 0, 'refused').flows[0].steps[0].branches).toEqual([{ kind: 'refused', when: '', then: '' }]);
	});

	it('renames a state in its transitions, takes a state away with them, and moves where the thing starts', () => {
		const d = bakery();
		const renamed = renameState(d, 'Order', 'ready', 'waiting');
		expect(renamed.machines[0].transitions.map((t) => `${t.from}>${t.to}`)).toEqual(['placed>waiting', 'waiting>collected', 'waiting>not collected']);
		expect(removeState(d, 'Order', 'ready').machines[0].transitions).toEqual([]);
		expect(setInitialState(d, 'Order', 'ready').machines[0].states[0]).toBe('ready');
		const added = addTransition(d, 'Order', 'collected');
		expect(added.diagram.machines[0].transitions[added.index]).toEqual({ from: 'collected', to: 'placed', trigger: '' });
	});

	it('leads a new transition to the state just made, from the one made before it [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
		const thing = addMachine(readFunctionalDiagram('').diagram, 'fr');
		const made = addState(thing.diagram, thing.object, 'fr');
		const added = addTransition(made.diagram, thing.object, made.name);
		expect(added.diagram.machines[0].transitions[added.index]).toEqual({ from: 'créé', to: 'Nouvel état', trigger: '' });
		const none = addTransition(made.diagram, thing.object);
		expect(none.diagram.machines[0].transitions[none.index]).toMatchObject({ from: 'créé', to: 'Nouvel état' });
	});
});

describe('the diagram is an answer of the Functional spec [criterion:ac-leaf-ac-evo-func-uml]', () => {
	const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
	let counter = 0;
	const ctx: ActContext = { actor: ana, at: '2026-10-20T10:00:00.000Z', newId: () => `id-${++counter}`, soloWorkspace: false };
	const ok = (outcome: ActOutcome): EvolutionRequest => {
		if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
		return outcome.request;
	};

	it('is written with answer_step, versioned like any answer, and never required', () => {
		const request = createEvolutionRequest({ id: 'r1', title: 'Ready text', origin: 'customer_feedback', stage: 'specification' });
		const drawn = ok(answerStepAct(ctx, request, { step: 'functional_spec', question: FUNCTIONAL_DIAGRAM_KEY, answer: BAKERY }));
		expect(drawn.stepAnswers.functional_spec.diagram).toBe(BAKERY);
		expect(drawn.fieldVersions.filter((v) => v.key === 'step.functional_spec.diagram').map((v) => v.value)).toEqual([BAKERY]);
		const step = readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'functional_spec')!;
		expect(step.detail).not.toMatch(/diagram/i);
	});

	it('is redrawn by the AI from the texts once drawn, never asked of the person, and never owed undrawn [criterion:ac-leaf-ac-evo-func-uml-ai]', () => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		const described: EvolutionRequest = {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepDescriptions: { solution: 'Text the customer.', functional_spec: 'The baker marks the bag ready; the customer gets a text.', technical_spec: '' },
			stepAnswers: { ...base.stepAnswers, solution: { examples: 'One text within a minute.', out_of_scope: '' } },
			stepValidations: (['need', 'solution'] as const).map((step) => ({ step, validatorIds: [], validations: [{ by: 'ana', kind: 'person' as const, at: 't' }] }))
		};
		const facts = (request: EvolutionRequest): CoachFacts => ({
			path: readPath(request, { questionsOwed: 0, pendingProposals: 0 }),
			pendingProposals: 0,
			questionsOwed: 0,
			gate: { ok: true, reason: null },
			collisions: 0,
			frictions: 0,
			undecidedLines: 0,
			solo: true
		});
		// Never drawn, the diagram is offered, never owed: nothing asks for it (EVO-013).
		expect(coachOf(described, facts(described)).then.join(' ')).not.toMatch(/raw the Functional spec's diagram/);
		const drawn = ok(redrawDiagramAct(ctx, described, { diagram: BAKERY }));
		expect(coachOf(drawn, facts(drawn)).then.join(' ')).not.toMatch(/raw the Functional spec's diagram/);
		// Once drawn, it follows its texts: a text written after it puts the redraw first.
		const moved = ok(updateStepDescriptionAct(ctx, drawn, { step: 'functional_spec', description: 'The baker marks the bag ready; the customer gets one text.' }));
		const next = coachOf(moved, facts(moved));
		expect(next.step).toBe('functional_spec');
		expect(next.then[0]).toMatch(/^Redraw the Functional spec's diagram from its texts first: redraw_diagram \{diagram\}/);
		// Whatever step the request stands on, the act that catches the diagram up comes first.
		const atNeed: EvolutionRequest = { ...moved, stepValidations: [] };
		expect(coachOf(atNeed, facts(atNeed)).then[0]).toMatch(/^Redraw the Functional spec's diagram/);
		expect(next.ask.join(' ')).not.toMatch(/Draw it/);
	});
});

describe('what is added is named in the spec\'s language [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
	it('names a new person, use case, step, thing and state in French on a French spec, in English otherwise', () => {
		const start = readFunctionalDiagram('').diagram;
		const person = addActor(start, 'person', 'fr');
		expect(person.name).toBe('Nouvelle personne');
		const useCase = addUseCase(person.diagram, [person.name], 'fr');
		expect(useCase.name).toBe("Nouveau cas d'utilisation");
		const step = addStep(useCase.diagram, useCase.name, null, undefined, 'fr');
		expect(step.diagram.flows[0].steps[0].text).toBe('Nouvelle étape');
		const thing = addMachine(step.diagram, 'fr');
		expect(thing.object).toBe('Nouvel objet');
		expect(thing.diagram.machines[0].states).toEqual(['créé']);
		expect(addState(thing.diagram, thing.object, 'fr').name).toBe('Nouvel état');
		expect(addActor(start, 'system').name).toBe('New system');
	});
});
