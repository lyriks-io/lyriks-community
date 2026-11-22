import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import SolutionTab, { type ProseQuestion } from './SolutionTab.svelte';
import { firstOwingSection } from './solution-owed';

const question = (step: ProseQuestion['step'], value: string): ProseQuestion =>
	({ step, key: 'description', label: 'Description', field: { path: `${step}.description`, value, filled: true, trail: null } }) as never;
const CONSTRAINT = 'The count drops in the same operation as the order';

const page = (shown: readonly string[] = [], editing: string | null = null) =>
	render(SolutionTab, {
		props: {
			projectId: 'p',
			requestId: 'req-1',
			functional: [question('functional_spec', 'The customer orders a counted loaf')],
			technical: [question('technical_spec', CONSTRAINT)],
			stepOf: () => ({ skip: null, validation: null }),
			members: [],
			actorId: 'me',
			canEdit: true,
			canValidate: true,
			canComment: true,
			lang: 'en',
			mentionLinks: {},
			versionsOf: () => [],
			nameOf: (id: string) => id,
			editing,
			onEdit: () => {},
			openOwed: false,
			diagramShown: (id: string) => shown.includes(id),
			onDiagram: () => {},
			useCaseDiagram: createRawSnippet(() => ({ render: () => '<svg aria-label="Use cases drawn"></svg>' })),
			technicalDiagram: createRawSnippet(() => ({ render: () => '<svg aria-label="Parts drawn"></svg>' })),
			onGoSpecification: () => {}
		} as never
	}).body;

describe('page editing holds the two Solution sections independently [criterion:4477db19]', () => {
	it('opens both sets of requirements and removes per-section save controls', () => {
		const body = page([], 'all');
		expect(body).toContain('aria-label="Functional requirements"');
		expect(body).toContain('aria-label="Technical requirements"');
		expect(body).toContain('value="The customer orders a counted loaf"');
		expect(body).toContain(`value="${CONSTRAINT}"`);
		expect(body).toContain('+ Add a requirement');
		expect(body).toContain('+ Add a technical requirement');
		expect(body).not.toContain('Done editing');
	});

	it('keeps the other section as a reading when a single section is edited', () => {
		const body = page([], 'sol-functional');
		expect(body).toContain('aria-label="Functional requirements"');
		expect(body).not.toContain('aria-label="Technical requirements"');
		expect(body).toContain(CONSTRAINT);
	});
});

describe('each section offers its drawing among its own controls [criterion:ac-leaf-ac-evo-sol-diagram-alone]', () => {
	it('has no List or Diagram bar and no section numbered for a drawing', () => {
		const body = page();
		expect(body).not.toMatch(/>List<|>Diagram</);
		expect(body).not.toMatch(/>2\.[34]</);
		// One in each section's header (the strip that follows a long section carries it too).
		expect(body.match(/size-9[^"]*" aria-pressed="false" aria-label="Show as a diagram"/g)?.length).toBe(2);
	});

	it('shows 2.1 as its use case diagram in place of its list, 2.2 untouched', () => {
		const body = page(['sol-functional']);
		expect(body).toContain('Use cases drawn');
		expect(body).toContain('aria-label="Show as a list"');
		expect(body).toContain(CONSTRAINT);
		expect(body).not.toContain('Parts drawn');
	});

	it('shows 2.2 as the technical diagram, the technical requirements never laid beside the use cases', () => {
		const body = page(['sol-technical']);
		expect(body).toContain('Parts drawn');
		expect(body).not.toContain(CONSTRAINT);
		expect(body).not.toContain('Use cases drawn');
	});

	it('marks no drawing owed: a diagram is offered, never owed (EVO-013)', () => {
		expect(page()).not.toMatch(/is owed/);
	});
});

describe('each requirement carries its kind (src-owner-fr-kinds-20261030) [criterion:ac-leaf-ac-evo-sol-diagram-alone]', () => {
	const answer = (step: ProseQuestion['step'], key: string, value: string): ProseQuestion =>
		({ step, key, label: key, field: { path: `step.${step}.${key}`, value, filled: true, trail: null } }) as never;
	const kinds = (lang: 'en' | 'fr') =>
		render(SolutionTab, {
			props: {
				projectId: 'p',
				requestId: 'req-1',
				functional: [
					answer('solution', 'description', 'Mode 2 joueurs'),
					answer('functional_spec', 'refusals', 'Une touche ne bouge que sa pièce'),
					answer('functional_spec', 'interactions', 'Q D Z S pour le joueur 1'),
					answer('functional_spec', 'screens', 'Deux terrains côte à côte'),
					answer('functional_spec', 'experience', 'Le perdant voit « Terminé »')
				],
				technical: [],
				stepOf: () => ({ skip: null, validation: null }),
				members: [],
				actorId: 'me',
				canEdit: true,
				canValidate: true,
				canComment: true,
				lang,
				mentionLinks: {},
				versionsOf: () => [],
				nameOf: (id: string) => id,
				editing: null,
				onEdit: () => {},
				openOwed: false,
				diagramShown: () => false,
				onDiagram: () => {},
				useCaseDiagram: createRawSnippet(() => ({ render: () => '<svg></svg>' })),
				onGoSpecification: () => {}
			} as never
		}).body;

	it('reads Rule, Interaction, Screen and Experience, a refusal being a rule', () => {
		const body = kinds('en');
		for (const kind of ['>Change<', '>Rule<', '>Interaction<', '>Screen<', '>Experience<']) expect(body).toContain(kind);
		expect(body).not.toContain('>Refusal<');
	});

	it('says them in the language of the spec', () => {
		const body = kinds('fr');
		for (const kind of ['>Changement<', '>Règle<', '>Interaction<', '>Écran<', '>Expérience<']) expect(body).toContain(kind);
		expect(body).not.toContain('>Refus<');
	});
});

describe('Validate all leaves out a section whose texts and diagram are not in step [criterion:8fa75115]', () => {
	const BEHIND = 'Its diagram is behind its texts: bring the diagram in step with them before validating';
	const foot = (outOf: readonly string[]) =>
		render(SolutionTab, {
			props: {
				projectId: 'p',
				requestId: 'req-1',
				functional: [question('functional_spec', 'The customer orders a counted loaf')],
				technical: [question('technical_spec', CONSTRAINT)],
				stepOf: () => ({ skip: null, validation: null }),
				members: [],
				actorId: 'me',
				canEdit: true,
				canValidate: true,
				canComment: true,
				lang: 'en',
				mentionLinks: {},
				versionsOf: () => [],
				nameOf: (id: string) => id,
				editing: null,
				onEdit: () => {},
				openOwed: false,
				diagramShown: () => false,
				onDiagram: () => {},
				outOfStep: (step: string) => (outOf.includes(step) ? BEHIND : null),
				useCaseDiagram: createRawSnippet(() => ({ render: () => '<svg></svg>' })),
				technicalDiagram: createRawSnippet(() => ({ render: () => '<svg></svg>' })),
				onGoSpecification: () => {}
			} as never
		}).body;

	it('counts every waiting section while both are in step', () => {
		const body = foot([]);
		expect(body).toContain('Validate all (2)');
		expect(body).not.toContain(BEHIND);
	});

	it('counts 2.1 alone and names 2.2 in its tooltip, 2.2 holding its own Validate with the reason', () => {
		const body = foot(['technical_spec']);
		expect(body).toContain('Validate all (1)');
		expect(body).toContain('while 2.2 Technical requirements waits until its diagram and its texts say the same');
		expect(body).toMatch(new RegExp(`title="${BEHIND}"[^>]*disabled`));
	});

	it('offers no Validate all once nothing it could send waits', () => {
		expect(foot(['functional_spec', 'technical_spec'])).not.toContain('Validate all');
	});
});

describe('the Solution\'s examples, the Functional spec and the Technical spec read Optional and open no editor on their own [criterion:ac-leaf-0a4d6036-275f-4249-9dcc-19a26d794667]', () => {
	const row = (step: ProseQuestion['step'], key: string, value: string): ProseQuestion =>
		({ step, key, label: key, field: { path: `step.${step}.${key}`, value, filled: value.trim() !== '', openQuestion: false, pendingProposalId: null, trail: null } }) as never;
	const solutionWith = (functionalRules = '', technical = '') => ({
		functional: [
			row('solution', 'description', 'Only the Need and the Solution are owed'),
			row('solution', 'examples', ''),
			row('functional_spec', 'description', ''),
			row('functional_spec', 'refusals', functionalRules)
		],
		technical: [row('technical_spec', 'description', technical), row('technical_spec', 'data', '')]
	});
	const tab = (questions: ReturnType<typeof solutionWith>, canEdit = true) =>
		render(SolutionTab, {
			props: {
				projectId: 'p',
				requestId: 'req-1',
				...questions,
				stepOf: () => ({ skip: null, validation: null }),
				members: [],
				actorId: 'me',
				canEdit,
				canValidate: true,
				canComment: true,
				lang: 'en',
				mentionLinks: {},
				versionsOf: () => [],
				nameOf: (id: string) => id,
				editing: null,
				onEdit: () => {},
				openOwed: true,
				diagramShown: () => false,
				onDiagram: () => {},
				useCaseDiagram: createRawSnippet(() => ({ render: () => '<svg></svg>' })),
				technicalDiagram: createRawSnippet(() => ({ render: () => '<svg></svg>' })),
				onGoSpecification: () => {}
			} as never
		}).body;
	const optionalLines = (body: string) => [...body.matchAll(/<p[^>]*data-optional[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

	it('reads the examples and the Functional spec Optional under 2.1, the Technical spec under 2.2, never as owed', () => {
		const body = tab(solutionWith());
		const lines = optionalLines(body);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/^Optional Example · Functional spec: write them when the change needs them, or let your AI prefill them\.$/);
		expect(lines[1]).toMatch(/^Optional Technical spec: write it when the change needs it, or let your AI prefill it\.$/);
		// 2.2 owes nothing: it never reads as a section left to write.
		expect(body.match(/Nothing written yet: edit the section to write it\./g)).toBeNull();
	});

	it('stops reading a part Optional once something is written in it', () => {
		const lines = optionalLines(tab(solutionWith('No request enters without a draft.', 'readyForImpact asks for a draft.')));
		expect(lines).toEqual(['Optional Example: write it when the change needs it, or let your AI prefill it.']);
	});

	it('says to a reader who may not edit that the offered parts are not written', () => {
		expect(optionalLines(tab(solutionWith(), false))[1]).toBe('Optional Technical spec: not written.');
	});

	it('opens by itself only the section that owes the Solution\'s description', () => {
		const sections = (description: string) => [
			{ id: 'sol-functional', questions: solutionWith().functional.map((q) => (q.key === 'description' && q.step === 'solution' ? row('solution', 'description', description) : q)) },
			{ id: 'sol-technical', questions: solutionWith().technical }
		];
		// Everything offered is empty, the description written: no editor opens.
		expect(firstOwingSection(sections('Only the Need and the Solution are owed'))).toBeNull();
		// The description empty: 2.1 opens, for it.
		expect(firstOwingSection(sections(''))?.id).toBe('sol-functional');
	});
});
