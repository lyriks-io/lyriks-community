import { describe, expect, it } from 'vitest';
import { coachOf, owesAnswer, type CoachFacts } from './coach';
import { createEvolutionRequest, createProposal, type EvolutionRequest } from './draft';
import { readPath } from './path';

/**
 * What comes next on a request, said to whoever drives it. What these pin is
 * the conversation it makes possible: the questions of NOW, never a list of
 * everything; never a question whose answer already waits for a signature; and
 * the decisions named as the person's.
 */
const facts = (request: EvolutionRequest, over: Partial<CoachFacts> = {}): CoachFacts => ({
	path: readPath(request, { questionsOwed: 0, pendingProposals: over.pendingProposals ?? 0 }),
	pendingProposals: 0,
	questionsOwed: 0,
	gate: { ok: true, reason: null },
	collisions: 0,
	frictions: 0,
	undecidedLines: 0,
	solo: true,
	...over
});

describe('what comes next', () => {
	it('opens on the need, with its essential questions only [criterion:ac-leaf-ac-evo-coach-1]', () => {
		const request = createEvolutionRequest({ status: 'open', stage: 'specification' });
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('need');
		expect(next.ask).toEqual([
			'In your own words, what is the change about, and who asked for it?',
			'What happens today, and for whom?',
			'What should be true once the change ships?'
		]);
		expect(next.then.join(' ')).toMatch(/update_need/);
	});

	it('never asks again what waits for a signature, and marks the optional [criterion:ac-leaf-ac-evo-coach-3]', () => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		const request: EvolutionRequest = {
			...base,
			need: { ...base.need, description: 'Alerts on low stock.' },
			proposals: [
				createProposal({ targetField: '00-need.situation', decision: 'pending' }),
				createProposal({ targetField: '00-need.objectives', decision: 'pending' })
			]
		};
		const next = coachOf(request, facts(request, { pendingProposals: 2 }));
		expect(next.ask).toEqual([]);
		expect(next.personDecides[0]).toMatch(/Sign the 2 values/);

		// Once the need is answered the request moves on, its validation optional: the Solution's own optional question is marked.
		const answered: EvolutionRequest = { ...request, proposals: [], need: { ...request.need, situation: 's', objectives: 'o' } };
		const next2 = coachOf(answered, facts(answered));
		expect(next2.step).toBe('solution');
		expect(next2.ask).toContain('What is left out of this change? (optional)');
	});

	it('asks no validation of a written step before the build, and names the freeze once the gate is met', () => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		const request: EvolutionRequest = { ...base, need: { ...base.need, description: 'd', situation: 's', objectives: 'o' } };
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('solution');
		expect(next.personDecides.join(' ')).not.toMatch(/Validate Need/);

		const frozenNext = createEvolutionRequest({ status: 'open', stage: 'coherence', specVersion: 0 });
		const ready: EvolutionRequest = {
			...frozenNext,
			impactReport: { status: 'ready', hypothesis: 'add', depth: 2, ranAt: 't' },
			coherenceReport: { status: 'ready', projectScore: 90, requestDelta: 0, ranAt: 't' },
			stepValidations: ['need', 'solution', 'functional_spec', 'technical_spec'].map((step) => ({
				step: step as 'need',
				validatorIds: [],
				validations: [{ by: 'ana', kind: 'person' as const, at: 't' }]
			}))
		};
		expect(coachOf(ready, facts(ready)).personDecides).toContain('Freeze version 1 on the request (cross_stage); nothing becomes official before it is declared live.');
	});
});

describe('the Specification an AI wrote waits for a person before the freeze [criterion:ac-leaf-ac-evo-form-step-lock]', () => {
	const base = createEvolutionRequest({ status: 'open', stage: 'coherence', specVersion: 0 });
	const ready: EvolutionRequest = {
		...base,
		leafIds: ['feat-api-key'],
		impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: 't' },
		coherenceReport: { status: 'ready', projectScore: 91, requestDelta: 0, ranAt: 't' },
		stepValidations: ['need', 'solution', 'functional_spec', 'technical_spec'].map((step) => ({
			step: step as 'need',
			validatorIds: [],
			validations: [{ by: 'ana', kind: 'person' as const, at: 't' }]
		}))
	};
	const FREEZE = 'Freeze version 1 on the request (cross_stage); nothing becomes official before it is declared live.';

	it('asks the person to validate each answer of the touched features, and offers no freeze until they did', () => {
		const next = coachOf(ready, facts(ready, { specification: { total: 3, validated: 1 } }));
		expect(next.say).toMatch(/The Specification waits for a person's validation\./);
		expect(next.personDecides.join(' ')).toMatch(/Validate the Specification: .*each action, each path of the journey and each change to the data .*2 of 3 left, waiting on you\./);
		expect(next.personDecides).not.toContain(FREEZE);
	});

	it('offers the freeze once a person stands behind every answer', () => {
		const next = coachOf(ready, facts(ready, { specification: { total: 3, validated: 3 } }));
		expect(next.personDecides.join(' ')).not.toMatch(/Validate the Specification/);
		expect(next.personDecides).toContain(FREEZE);
	});
});

describe('a question that still owes its answer holds its section open [criterion:ac-leaf-189c4d88-fc79-4757-8cfb-6b8511c45b34]', () => {
	const question = { filled: false, openQuestion: false, pendingProposalId: null };

	it('a question left empty owes its answer, required or not', () => {
		expect(owesAnswer(question)).toBe(true);
	});

	it('an answered question owes nothing', () => {
		expect(owesAnswer({ ...question, filled: true })).toBe(false);
	});

	it('a question parked as an open question owes its answer, answered or not', () => {
		expect(owesAnswer({ ...question, filled: true, openQuestion: true })).toBe(true);
	});

	it('a suggestion waiting on it, or a skip on purpose, settles it for now', () => {
		expect(owesAnswer({ ...question, pendingProposalId: 'p1' })).toBe(false);
		expect(owesAnswer({ ...question, skipped: { by: 'ana', reason: 'Not relevant' } })).toBe(false);
	});
});

describe('the Solution never goes without its diagram [criterion:ac-leaf-ac-evo-sol-with-diagram]', () => {
	const atSolution = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		return {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'ana', kind: 'person', at: 't' }] }],
			...over
		};
	};

	it('once the Solution is written, asks first for 2.1 and the use case diagram, then the technical side, in the same batch', () => {
		const base = atSolution();
		const request = atSolution({ stepDescriptions: { ...base.stepDescriptions, solution: 'A removed domain stops serving its links.' } });
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('solution');
		expect(next.then[0]).toMatch(/The use case diagram is owed/);
		expect(next.then[0]).toContain('update_step_description {step: "functional_spec", description}');
		expect(next.then[0]).toContain('redraw_diagram {step: "functional_spec", diagram}');
		expect(next.then.some((t) => t.includes('redraw_diagram {step: "technical_spec", diagram}'))).toBe(true);
	});

	it('asks nothing of the kind before the Solution is written, nor once the diagram is drawn', () => {
		const empty = atSolution();
		expect(coachOf(empty, facts(empty)).then.join(' ')).not.toMatch(/use case diagram is owed/);
		const base = atSolution();
		const drawn = atSolution({
			stepDescriptions: { ...base.stepDescriptions, solution: 'S', functional_spec: 'F', technical_spec: 'T' },
			stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Owner' } }
		});
		const next = coachOf(drawn, facts(drawn)).then.join(' ');
		expect(next).not.toMatch(/use case diagram is owed/);
		expect(next).not.toContain('redraw_diagram {step: "technical_spec", diagram}; when it has none');
	});
});

describe('the Solution is handed over with its validation optional until the build', () => {
	const written = (): EvolutionRequest => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		return {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepDescriptions: { solution: 'A removed domain stops serving its links.', functional_spec: 'The owner removes it.', technical_spec: 'One column.' },
			stepAnswers: { ...base.stepAnswers, solution: { examples: 'Alice removes it.', out_of_scope: '' }, functional_spec: { ...base.stepAnswers.functional_spec, refusals: 'Refused while links remain.' } },
			stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'ana', kind: 'person', at: 't' }] }]
		};
	};

	it('hands the person the Solution once it is written, says its validation is optional, and names no feature before', () => {
		const request = written();
		const next = coachOf(request, facts(request)).then.join(' ');
		expect(next).toContain('Hand the person the link to the Solution (its texts and its two diagrams): validating it is optional now, and it is the one validation the build waits for.');
		expect(next).not.toMatch(/then add_draft_leaf \(add \| amend \| remove\) for each/);
	});

	it('stays at the Impact analysis when the Solution\'s validation fell after it was reached', () => {
		const request = { ...written(), stage: 'coherence' as const };
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		expect(next.say).toBe('Name what the change touches, from the Solution.');
	});
});

describe('an AI client fills every required text of the Solution tab before it hands it over [criterion:6c37a06f]', () => {
	// EVO-002 on Kutt: the three texts written, the Functional spec's rules left empty.
	const withoutRules = (): EvolutionRequest => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		return {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepDescriptions: { solution: 'Settles 19 findings.', functional_spec: 'Nothing changes for the people using Kutt.', technical_spec: 'No code.' },
			stepAnswers: {
				...base.stepAnswers,
				solution: { examples: 'Project health no longer lists them.', out_of_scope: '' },
				functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Owner' }
			},
			stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'ana', kind: 'person', at: 't' }] }]
		};
	};

	it('asks for 2.1 Rule, with the operation and the way out, and does not hand the Solution over', () => {
		const request = withoutRules();
		const next = coachOf(request, facts(request));
		// The Solution is written: the request reads at the Functional spec, nobody having validated anything.
		expect(next.step).toBe('functional_spec');
		expect(next.ask).toContain('What does the product allow or refuse, and why?');
		const then = next.then.join(' ');
		expect(then).toContain('answer_step {step: "functional_spec", question: "refusals" |');
		expect(then).not.toContain('Hand the person the link to the Solution');
	});

	it('hands it over once the rules are written, or skipped on purpose', () => {
		const base = withoutRules();
		const written = { ...base, stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, refusals: 'Nothing new: Kutt refuses what it refused before.' } } };
		expect(coachOf(written, facts(written)).then.join(' ')).toContain('Hand the person the link to the Solution');
		const skipped = { ...base, skippedQuestions: [{ key: 'step.functional_spec.refusals', reason: 'No behaviour changes.', by: 'ana', at: 't' }] } as EvolutionRequest;
		const next = coachOf(skipped, facts(skipped)).then.join(' ');
		expect(next).not.toContain('2.1 Rule is owed');
		expect(next).toContain('Hand the person the link to the Solution');
	});
});
