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
		expect(next.say).toMatch(/The Specification waits for its validation\./);
		expect(next.personDecides.join(' ')).toMatch(/Validate the Specification: .*each action, each path of the journey and each change to the data .*2 of 3 left, waiting on you\./);
		expect(next.personDecides).not.toContain(FREEZE);
	});

	it('names the freeze as a person\'s act, never as what follows the validation on its own [criterion:4913a449]', () => {
		const next = coachOf(ready, facts(ready, { specification: { total: 3, validated: 1 } }));
		expect(next.personDecides.join(' ')).not.toMatch(/frozen once/);
		// The freeze follows the person's last validation in their act, never one an AI gives (EVO-011).
		expect(next.personDecides).toContain(
			"Then version 1 freezes in the act of the person whose validation leaves nothing of it waiting, once the rest of the gate is met: a person's act, never a validation you give, under delegation or not; a person may also freeze it (cross_stage)."
		);
	});

	it('offers the freeze once a person stands behind every answer', () => {
		const next = coachOf(ready, facts(ready, { specification: { total: 3, validated: 3 } }));
		expect(next.personDecides.join(' ')).not.toMatch(/Validate the Specification/);
		expect(next.personDecides).toContain(FREEZE);
	});

	it('says the engine did not answer and offers no freeze while the actions cannot be read [criterion:c623df9c]', () => {
		const unread = 'The engine did not answer, so the actions of the Specification cannot be read now.';
		const next = coachOf(ready, facts(ready, { specification: { total: 3, validated: 3, unread } }));
		expect(next.say).toContain(`${unread} Try again in a moment.`);
		expect(next.personDecides.join(' ')).not.toMatch(/Validate the Specification: .* left/);
		expect(next.personDecides).not.toContain(FREEZE);
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

describe('the Solution owes its description only: its examples, the specs and their diagrams are offered, never owed [criterion:ac-leaf-e5ba6571-f7b3-44e0-af63-03c41cfcf461]', () => {
	const atSolution = (over: Partial<EvolutionRequest> = {}): EvolutionRequest => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		return {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'ana', kind: 'person', at: 't' }] }],
			...over
		};
	};

	it('asks what changes, offers the rest as optional, and says none of it is owed', () => {
		const request = atSolution();
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('solution');
		expect(next.say).toBe('Say what changes in the product.');
		expect(next.ask[0]).toBe('In your own words, what changes in the product?');
		expect(next.ask.slice(1).length).toBeGreaterThan(0);
		expect(next.ask.slice(1).every((q) => q.endsWith('(optional)'))).toBe(true);
		expect(next.then.join(' ')).toContain('are offered, never owed');
	});

	it('once the Solution is written, asks neither 2.1, nor a diagram, nor the technical side, and goes on to what the change touches', () => {
		const base = atSolution();
		const request = atSolution({ stepDescriptions: { ...base.stepDescriptions, solution: 'A removed domain stops serving its links.' } });
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		const then = next.then.join(' ');
		expect(then).not.toMatch(/is owed/);
		expect(then).not.toContain('update_step_description {step: "functional_spec"');
		expect(then).not.toContain('redraw_diagram');
		expect(then).not.toContain('mark_step_not_applicable');
		expect(then).toContain('add_draft_leaf');
		expect(next.say).toBe('Name what the change touches, from the Solution.');
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

	it('goes on to name what the change touches once the Solution is written, asking no validation of it', () => {
		const request = written();
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		expect(next.then.join(' ')).toMatch(/name the features the change touches/);
		expect(next.personDecides.join(' ')).not.toMatch(/Validate (Solution|Functional spec|Technical spec)/);
	});

	it('stays at the Impact analysis when the Solution\'s validation fell after it was reached', () => {
		const request = { ...written(), stage: 'coherence' as const };
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		expect(next.say).toBe('Name what the change touches, from the Solution.');
	});
});

describe('the one text the Solution tab owes is the Solution\'s description [criterion:ac-leaf-c1db73b7-2455-491d-a5ad-3bfbf20a49de]', () => {
	// EVO-002 on Kutt: the three texts written, the Functional spec's rules left empty.
	const withoutRules = (): EvolutionRequest => {
		const base = createEvolutionRequest({ status: 'open', stage: 'specification' });
		return {
			...base,
			need: { ...base.need, description: 'd', situation: 's', objectives: 'o' },
			stepDescriptions: { solution: 'Settles 19 findings.', functional_spec: 'Nothing changes for the people using Kutt.', technical_spec: 'No code.' },
			stepAnswers: { ...base.stepAnswers, solution: { examples: 'Project health no longer lists them.', out_of_scope: '' } },
			stepValidations: [{ step: 'need', validatorIds: [], validations: [{ by: 'ana', kind: 'person', at: 't' }] }]
		};
	};

	it('asks no rule of the Functional spec: what the product refuses is offered, never owed (EVO-013)', () => {
		const request = withoutRules();
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('impact_analysis');
		expect(next.ask).not.toContain('What does the product allow or refuse, and why?');
		expect(next.then.join(' ')).not.toMatch(/Rule is owed/);
	});

	it('asks the Solution\'s description while it is empty, the one text the tab owes', () => {
		const base = withoutRules();
		const request = { ...base, stepDescriptions: { ...base.stepDescriptions, solution: '' } };
		const next = coachOf(request, facts(request));
		expect(next.step).toBe('solution');
		expect(next.ask[0]).toBe('In your own words, what changes in the product?');
		expect(next.then[0]).toBe('update_step_description {step: "solution", description}: the person\'s own words, verbatim.');
	});
});

describe('at Build, what a test closes is said apart from what a person decides [criterion:4913a449]', () => {
	const request = createEvolutionRequest({ status: 'open', stage: 'implementation', specVersion: 1, frozen: true });

	it('asks a decision only on the lines that wait for a person, and says the others close on the code or a test', () => {
		const next = coachOf(request, facts(request, { undecidedLines: 1, linesAwaitingCode: 3 }));
		expect(next.personDecides).toContain('Decide the 1 report line this change brought that waits for a person (decide_line): an addition out of scope, a regression, a table change to confirm.');
		expect(next.then).toContain(
			'3 report lines this change brought wait for the code or a passing test (not built yet, or found and not tested yet): write or prove them, then sync the index; they close on their own, nobody decides them.'
		);
	});

	it('asks no decision at all when every open line waits for the code or a test', () => {
		const next = coachOf(request, facts(request, { undecidedLines: 0, linesAwaitingCode: 2 }));
		expect(next.personDecides.join(' ')).not.toMatch(/decide_line/);
	});
});

describe('the next step says the crossings the product takes on its own (EVO-011)', () => {
	it('names the freeze as the act of the person whose validation completes the Specification, never one an AI gives, and a settled Build as moving into Approval on its own [criterion:ac-leaf-5b284837-c305-4f23-9f6e-1fe92a5cd68b]', () => {
		const base = createEvolutionRequest({ status: 'open', stage: 'coherence', specVersion: 0 });
		const atImpact: EvolutionRequest = {
			...base,
			leafIds: ['feat-api-key'],
			impactReport: { status: 'ready', hypothesis: 'change', depth: 2, ranAt: 't' },
			coherenceReport: { status: 'ready', projectScore: 91, requestDelta: 0, ranAt: 't' }
		};
		const freezing = coachOf(atImpact, facts(atImpact, { specification: { total: 3, validated: 1 } })).personDecides.join(' ');
		expect(freezing).toContain('freezes in the act of the person whose validation leaves nothing of it waiting');
		expect(freezing).toContain('never a validation you give, under delegation or not');
		const atBuild = createEvolutionRequest({ status: 'open', stage: 'implementation', specVersion: 1, frozen: true });
		const settled = coachOf(atBuild, facts(atBuild, { gate: { ok: true, reason: null } }));
		expect(settled.then).toContain(
			'The report is settled: the Build moves into Approval on its own at the next report build (build_implementation_report); the approval then fixes the commit that goes live.'
		);
		expect(settled.personDecides.join(' ')).not.toMatch(/cross_stage|Accept the Build/);
	});
});
