import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from '$lib/application/evolution/parse-evolution-draft';
import {
	askQuestionAct,
	decideProposalAct,
	proposeAct,
	resolveQuestionAct,
	updateNeedAct,
	updateRequestAct,
	updateStepDescriptionAct,
	validateFieldAct,
	refuseFieldAct,
	markOpenQuestionAct,
	skipQuestionAct,
	unskipQuestionAct,
	withdrawFieldVerdictAct,
	editMessageAct,
	postOnFieldAct,
	ruleTopicAct,
	type ActContext,
	type ActOutcome
} from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { fieldValidationOf, stepDescriptionKey, versionsOf } from './field-versions';
import { MAX_OPEN_CUSTOM_QUESTIONS, openCustomQuestions, openQuestionsOnField } from './custom-questions';
import { answersEditableAt, needCriticalEmpty, readPath, requiredTextsEmpty } from './path';
import { coachOf } from './coach';
import { ALLOW } from './guard';

/**
 * The rules set for the dossier on 2026-10-07: a description first on every
 * step, every field versioned and validated version by version by anyone with
 * access, questions asked of the request in particular, and the glossary read
 * on every text a person types.
 */

const ana: Actor = { id: 'ana', kind: 'person', role: 'member', channel: 'page' };
const bo: Actor = { id: 'bo', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { id: 'vi', kind: 'person', role: 'viewer', channel: 'page' };
const client: Actor = { id: 'ana', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor, solo = false): ActContext => ({
	actor,
	at: '2026-10-07T12:00:00.000Z',
	newId: () => `id-${++counter}`,
	soloWorkspace: solo,
	bannedWords: [{ avoid: 'basket', prefer: 'cart' }]
});

const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome): string => (outcome.ok ? '' : outcome.reason);
const summaryOf = (outcome: ActOutcome): string => (outcome.ok ? outcome.summary : '');

const open = (overrides: Partial<EvolutionRequest> = {}): EvolutionRequest =>
	createEvolutionRequest({ id: 'req-1', title: 'Pickup reminders', origin: 'customer_feedback', stage: 'specification', leafIds: ['feat-a'], ...overrides });

describe('every field keeps its versions (ac-evo-hist-field-versions)', () => {
	it('adds a version on each change of the need, and none on a rewrite of the same words', () => {
		let request = ok(updateNeedAct(ctxFor(ana), open(), { situation: 'Two bags a week are never picked up.' }));
		request = ok(updateNeedAct(ctxFor(bo), request, { situation: 'Three bags a week are never picked up.' }));
		request = ok(updateNeedAct(ctxFor(bo), request, { situation: 'Three bags a week are never picked up.' }));
		const versions = versionsOf(request, '00-need.situation');
		expect(versions.map((v) => [v.by, v.value, v.source])).toEqual([
			['bo', 'Three bags a week are never picked up.', 'typed'],
			['ana', 'Two bags a week are never picked up.', 'typed']
		]);
	});

	it('stamps an accepted proposal as the version it produced', () => {
		const proposed = ok(
			proposeAct(
				ctxFor(client),
				open(),
				{
					fieldPath: '00-need.objectives',
					leafId: null,
					value: 'No bag waits past closing time.',
					reasoning: '',
					whatWasRead: 'The baker said bags wait.',
					whatWasInferred: 'The objective is the opposite.',
					citedSourceIds: ['src-1']
				},
				{ sourceExists: () => true, bannedWords: [] }
			)
		);
		const accepted = ok(decideProposalAct(ctxFor(ana), proposed, proposed.proposals[0].id, { decision: 'accept' }, () => ALLOW));
		expect(versionsOf(accepted, '00-need.objectives')[0]).toMatchObject({ source: 'proposal', proposalId: proposed.proposals[0].id, by: 'ana' });
	});

	it('accepting validates nothing, not even in the name of who accepted it, nor does a rewording [criterion:ac-leaf-ac-evo-hist-accept-awaits-validation]', () => {
		const proposed = ok(
			proposeAct(
				ctxFor(client),
				open(),
				{
					fieldPath: '00-need.situation',
					leafId: null,
					value: 'Two bags a week are never picked up.',
					reasoning: '',
					whatWasRead: 'The baker said bags wait.',
					whatWasInferred: 'Twice a week.',
					citedSourceIds: ['src-1']
				},
				{ sourceExists: () => true, bannedWords: [] }
			)
		);
		const id = proposed.proposals[0].id;
		const accepted = ok(decideProposalAct(ctxFor(ana), proposed, id, { decision: 'accept' }, () => ALLOW));
		expect(accepted.need.situation).toBe('Two bags a week are never picked up.');
		expect(fieldValidationOf(accepted, '00-need.situation').status).not.toBe('validated');
		expect(fieldValidationOf(accepted, '00-need.situation').validations).toEqual([]);
		const reworded = ok(decideProposalAct(ctxFor(ana), proposed, id, { decision: 'reword', value: 'Three bags a week.' }, () => ALLOW));
		expect(fieldValidationOf(reworded, '00-need.situation').status).not.toBe('validated');
	});
});

describe('a field is validated version by version (ac-evo-hist-field-validation, ac-evo-hist-outside)', () => {
	const written = () => ok(updateNeedAct(ctxFor(ana), open(), { situation: 'Bags wait.' }));

	it('lets any member validate, outdates the validation on the next write, and never erases it', () => {
		let request = ok(validateFieldAct(ctxFor(bo), written(), { key: '00-need.situation', liveValue: 'Bags wait.' }));
		expect(fieldValidationOf(request, '00-need.situation').status).toBe('validated');
		request = ok(updateNeedAct(ctxFor(ana), request, { situation: 'Bags wait until closing.' }));
		const reading = fieldValidationOf(request, '00-need.situation');
		expect(reading.status).toBe('outdated');
		expect(reading.outdatedValidation?.by).toBe('bo');
		expect(request.fieldValidations).toHaveLength(1);
		request = ok(validateFieldAct(ctxFor(ana), request, { key: '00-need.situation', liveValue: 'Bags wait until closing.' }));
		expect(fieldValidationOf(request, '00-need.situation').status).toBe('validated');
	});

	it('keeps a validation once the dossier is saved and read back', () => {
		const request = ok(validateFieldAct(ctxFor(bo), written(), { key: '00-need.situation', liveValue: 'Bags wait.' }));
		const read = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request], lastSavedAt: null })), 'p').requests[0];
		expect(read.fieldValidations).toEqual(request.fieldValidations);
		expect(fieldValidationOf(read, '00-need.situation').status).toBe('validated');
	});

	it('refuses a viewer, an AI client in a team, and an empty field', () => {
		expect(reasonOf(validateFieldAct(ctxFor(viewer), written(), { key: '00-need.situation', liveValue: 'Bags wait.' }))).toBe(
			'A viewer reads and comments, but does not validate.'
		);
		expect(reasonOf(validateFieldAct(ctxFor(client), written(), { key: '00-need.situation', liveValue: 'Bags wait.' }))).toBe(
			'An AI client cannot validate a field.'
		);
		expect(ok(validateFieldAct(ctxFor(client, true), written(), { key: '00-need.situation', liveValue: 'Bags wait.' })).fieldValidations).toHaveLength(1);
		expect(reasonOf(validateFieldAct(ctxFor(ana), open(), { key: '00-need.cost', liveValue: '' }))).toBe('This field holds no value yet.');
	});

	it('says a value changed outside the dossier, and validates what it found there', () => {
		const request = written();
		expect(fieldValidationOf(request, '00-need.situation', 'Edited in the Features page.').status).toBe('changed_outside');
		const validated = ok(validateFieldAct(ctxFor(bo), request, { key: '00-need.situation', liveValue: 'Edited in the Features page.' }));
		expect(versionsOf(validated, '00-need.situation')[0]).toMatchObject({ value: 'Edited in the Features page.', source: 'earlier', by: 'bo' });
		expect(fieldValidationOf(validated, '00-need.situation', 'Edited in the Features page.').status).toBe('validated');
	});
});

describe('every step opens on a description (ac-evo-form-step-description)', () => {
	it('writes the description, versions it and asks the step again', () => {
		const request = ok(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'solution', description: 'Send a text when the bag is ready.' }));
		expect(request.stepDescriptions.solution).toBe('Send a text when the bag is ready.');
		expect(versionsOf(request, stepDescriptionKey('solution'))).toHaveLength(1);
		expect(reasonOf(updateStepDescriptionAct(ctxFor(ana), open(), { step: 'build', description: 'x' }))).toMatch(/^Solution, Functional spec and Technical spec open on a description/);
		expect(reasonOf(updateStepDescriptionAct(ctxFor(viewer), open(), { step: 'solution', description: 'x' }))).toBe(
			'A viewer reads and comments, but does not write.'
		);
	});

	it('points out a word the glossary keeps for another sense, and keeps the text (ac-evo-form-glossary)', () => {
		const outcome = updateStepDescriptionAct(ctxFor(ana), open(), { step: 'solution', description: 'Remind the customer to pick up the basket.' });
		expect(summaryOf(outcome)).toBe(
			'Solution: description written. Glossary: "basket" is kept for another sense, here it says "cart". The text is kept as written'
		);
		expect(ok(outcome).stepDescriptions.solution).toBe('Remind the customer to pick up the basket.');
	});
});

describe('questions asked of this request in particular (ac-evo-coach-custom-1..5)', () => {
	const ask = (request: EvolutionRequest, n: number) =>
		askQuestionAct(ctxFor(client), request, {
			step: 'need',
			question: `How many bags a week, question ${n}?`,
			why: 'The measure needs a value today.',
			fieldKey: '00-need.measures'
		});

	it('holds five open questions per step and refuses a sixth', () => {
		let request = open();
		for (let n = 1; n <= MAX_OPEN_CUSTOM_QUESTIONS; n++) request = ok(ask(request, n));
		expect(openCustomQuestions(request, 'need')).toHaveLength(5);
		expect(reasonOf(ask(request, 6))).toBe('This step already holds 5 open questions: answer or set one aside first.');
		expect(reasonOf(askQuestionAct(ctxFor(viewer), open(), { step: 'need', question: 'Why?', why: 'Curious.', fieldKey: null }))).toMatch(/^A viewer/);
	});

	it('marks its field incomplete, counts it as owed, and asks it before the generic questions', () => {
		const request = ok(ask(open({ need: { description: 'Bags wait.', situation: 'Bags wait.', symptoms: '', cost: '', objectives: 'None wait.', measures: '' } }), 1));
		expect(openQuestionsOnField(request, '00-need.measures')).toHaveLength(1);
		const need = readPath(request, { questionsOwed: 0, pendingProposals: 0 }).find((s) => s.step === 'need');
		expect(need?.progress).toBe('in_progress');
		expect(need?.detail).toMatch(/1 question asked of this request is owed\.$/);
		const path = readPath(request, { questionsOwed: 0, pendingProposals: 0 });
		const coach = coachOf(request, { path, pendingProposals: 0, questionsOwed: 0, gate: { ok: false, reason: null }, collisions: 0, frictions: 0, undecidedLines: 0, solo: false });
		expect(coach.ask[0]).toBe('How many bags a week, question 1? (The measure needs a value today.)');
	});

	it('is answered or set aside by a person, never by a client in a team', () => {
		const request = ok(ask(open(), 1));
		const id = request.customQuestions[0].id;
		expect(reasonOf(resolveQuestionAct(ctxFor(client), request, { questionId: id, resolution: 'answered', text: 'Twelve.' }))).toMatch(/^An AI client cannot/);
		const answered = ok(resolveQuestionAct(ctxFor(ana), request, { questionId: id, resolution: 'answered', text: 'About twelve.' }));
		expect(answered.customQuestions[0]).toMatchObject({ status: 'answered', resolution: 'About twelve.', resolvedBy: 'ana' });
		expect(reasonOf(resolveQuestionAct(ctxFor(ana), answered, { questionId: id, resolution: 'set_aside', text: 'n/a' }))).toBe(
			'This question is already answered or set aside.'
		);
		const aside = ok(resolveQuestionAct(ctxFor(bo), request, { questionId: id, resolution: 'set_aside', text: 'Closed on Sundays.' }));
		expect(openCustomQuestions(aside)).toHaveLength(0);
	});
});

describe('Need and Solution are validated answer by answer (ac-evo-form-validate-each)', () => {
	it('moves on from a written Need without holding on its validation, and never asks for the step as a whole', () => {
		const request = open({ need: { description: 'Bags wait.', situation: 'Bags wait.', symptoms: '', cost: '', objectives: 'None wait.', measures: '' } });
		const path = readPath(request, { questionsOwed: 0, pendingProposals: 0 });
		// Validating is optional until the build: the request reads at the Solution, its Need unvalidated.
		expect(path.find((s) => s.current)?.step).toBe('solution');
		const facts = { path, pendingProposals: 0, questionsOwed: 0, gate: { ok: false, reason: null }, collisions: 0, frictions: 0, undecidedLines: 0, solo: false };
		const coach = coachOf(request, { ...facts, inputs: { need: { total: 3, validated: 1 }, solution: { total: 0, validated: 0 } } });
		expect(coach.step).toBe('solution');
		expect(coach.personDecides.some((d) => d.startsWith('Validate each answer of Need'))).toBe(false);
		expect(coach.personDecides.some((d) => d.includes('validate_step "need"'))).toBe(false);
	});
});

describe('every question of the Need can be refused until members validate it (ac-evo-form-question-acts)', () => {
	const key = '00-need.situation';
	const written = () => ok(updateNeedAct(ctxFor(ana), open(), { situation: 'Bags are never picked up.' }));

	it('takes a refusal with its reason, lets a later validation stand, and clears it on a rewrite', () => {
		expect(reasonOf(refuseFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.', reason: ' ' }))).toBe('Say why the answer is refused.');
		let request = ok(refuseFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.', reason: 'How many a week?' }));
		expect(fieldValidationOf(request, key)).toMatchObject({ status: 'refused', refusal: { by: 'bo', reason: 'How many a week?' }, validations: [] });
		// A rewrite is a new version: the refusal stays in the history, on the old one.
		const rewritten = ok(updateNeedAct(ctxFor(ana), request, { situation: 'Three bags a week are never picked up.' }));
		expect(fieldValidationOf(rewritten, key).status).toBe('unvalidated');
		// The latest verdict on the current version decides.
		request = ok(validateFieldAct(ctxFor(ana), request, { key, liveValue: 'Bags are never picked up.' }));
		expect(fieldValidationOf(request, key).status).toBe('validated');
	});

	it('neither refuses nor postpones an answer members validated, and keeps a viewer out', () => {
		const validated = ok(validateFieldAct(ctxFor(ana), written(), { key, liveValue: 'Bags are never picked up.' }));
		expect(reasonOf(refuseFieldAct(ctxFor(bo), validated, { key, liveValue: 'Bags are never picked up.', reason: 'No.' }))).toBe('This answer is validated: rewrite it to reopen it.');
		expect(reasonOf(markOpenQuestionAct(ctxFor(bo), validated, key, null))).toBe('This answer is validated: rewrite it to reopen it.');
		expect(reasonOf(refuseFieldAct(ctxFor(viewer), written(), { key, liveValue: 'Bags are never picked up.', reason: 'No.' }))).toBe('A viewer reads and comments, but does not refuse.');
	});

	it('reads a stored refusal back as a refusal', () => {
		const request = ok(refuseFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.', reason: 'How many a week?' }));
		const reread = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [request] })), 'p').requests[0];
		expect(fieldValidationOf(reread, key)).toMatchObject({ status: 'refused', refusal: { reason: 'How many a week?' } });
	});
});

describe('a question can be skipped on purpose, with a reason (ac-evo-form-question-skip)', () => {
	const cost = '00-need.cost';
	const skip = (request: EvolutionRequest, fieldPath: string, reason = 'Nobody measures it today.') =>
		skipQuestionAct(ctxFor(ana), request, { fieldPath, leafId: null, reason, liveValue: '' });

	it('settles a required question of the Need: it is no longer owed and holds neither the step nor the freeze', () => {
		const request = ok(updateNeedAct(ctxFor(ana), open(), { description: 'd', objectives: 'Wrap at checkout.' }));
		expect(needCriticalEmpty(request)).toEqual(['00-need.situation']);
		const skipped = ok(skip(request, '00-need.situation', 'Nobody tracks it yet.'));
		expect(needCriticalEmpty(skipped)).toEqual([]);
		expect(skipped.skippedQuestions).toMatchObject([{ key: '00-need.situation', reason: 'Nobody tracks it yet.', by: 'ana' }]);
		// Answer it after all: owed again.
		expect(needCriticalEmpty(ok(unskipQuestionAct(ctxFor(ana), skipped, { fieldPath: '00-need.situation', leafId: null })))).toEqual(['00-need.situation']);
	});

	it('asks a reason, skips only an empty question, takes back a postponing, and is taken back by one', () => {
		expect(reasonOf(skip(open(), cost, ' '))).toBe('Say why the question is skipped.');
		expect(reasonOf(skipQuestionAct(ctxFor(ana), open(), { fieldPath: cost, leafId: null, reason: 'No.', liveValue: '12 hours a week' }))).toBe(
			'This question holds an answer: clear it to skip it.'
		);
		expect(reasonOf(skipQuestionAct(ctxFor(viewer), open(), { fieldPath: cost, leafId: null, reason: 'No.', liveValue: '' }))).toBe(
			'A viewer reads and comments, but does not skip a question.'
		);
		const postponed = ok(markOpenQuestionAct(ctxFor(ana), open(), cost, null));
		const skipped = ok(skip(postponed, cost));
		expect(skipped.openQuestionKeys).not.toContain(cost);
		expect(ok(markOpenQuestionAct(ctxFor(ana), skipped, cost, null)).skippedQuestions).toEqual([]);
	});

	it('settles the owed text of a step of prose, and keeps the skip across a reload', () => {
		const blank = open({ stepDescriptions: { solution: '', functional_spec: '', technical_spec: '' } });
		// The Solution owes its description only (EVO-013, criterion c1db73b7).
		expect(requiredTextsEmpty(blank, 'solution')).toEqual(['step.solution.description']);
		const skipped = ok(skip(blank, 'step.solution.description', 'The title says it all.'));
		expect(requiredTextsEmpty(skipped, 'solution')).toEqual([]);
		const reread = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [skipped] })), 'p').requests[0];
		expect(reread.skippedQuestions).toMatchObject([{ key: 'step.solution.description', reason: 'The title says it all.' }]);
	});
});

describe('a person goes back on a verdict they gave (ac-evo-hist-verdict-withdraw)', () => {
	const key = '00-need.situation';
	const written = () => ok(updateNeedAct(ctxFor(ana), open(), { situation: 'Bags are never picked up.' }));

	it('takes back a validation: the answer keeps its value and reads unvalidated, the history keeps both', () => {
		const validated = ok(validateFieldAct(ctxFor(ana), written(), { key, liveValue: 'Bags are never picked up.' }));
		expect(reasonOf(withdrawFieldVerdictAct(ctxFor(bo), validated, { key }))).toBe('You gave no verdict on this answer.');
		const back = ok(withdrawFieldVerdictAct(ctxFor(ana), validated, { key }));
		expect(fieldValidationOf(back, key).status).toBe('unvalidated');
		expect(back.need.situation).toBe('Bags are never picked up.');
		expect(back.history.at(-1)?.summary).toMatch(/validation taken back by ana/);
	});

	it('takes back a refusal, and the answer can be refused or validated again', () => {
		const refused = ok(refuseFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.', reason: 'How many?' }));
		const back = ok(withdrawFieldVerdictAct(ctxFor(bo), refused, { key }));
		expect(fieldValidationOf(back, key).status).toBe('unvalidated');
		expect(fieldValidationOf(ok(validateFieldAct(ctxFor(ana), back, { key, liveValue: 'Bags are never picked up.' })), key).status).toBe('validated');
	});
});

describe('the author edits a message they sent (ac-evo-fthread-edit)', () => {
	const posted = () => ok(postOnFieldAct(ctxFor(ana), open(), '00-need.situation', null, 'How many bags a weak?'));
	const idOf = (request: EvolutionRequest) => request.fieldThreads[0].messages[0].id;

	it('replaces the text, marks it edited and keeps the earlier one readable, across a reload', () => {
		const request = posted();
		const edited = ok(editMessageAct(ctxFor(ana), request, { messageId: idOf(request), body: 'How many bags a week?' }));
		const message = edited.fieldThreads[0].messages[0];
		expect(message).toMatchObject({ body: 'How many bags a week?', earlier: [{ body: 'How many bags a weak?' }] });
		expect(message.editedAt).toBeTruthy();
		const reread = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [edited] })), 'p').requests[0];
		expect(reread.fieldThreads[0].messages[0]).toMatchObject({ body: 'How many bags a week?', earlier: [{ body: 'How many bags a weak?' }] });
	});

	it('lets nobody else edit it, not even the AI client of its author, and refuses an empty text', () => {
		const request = posted();
		expect(reasonOf(editMessageAct(ctxFor(bo), request, { messageId: idOf(request), body: 'Other.' }))).toBe('Only its author edits a message.');
		expect(reasonOf(editMessageAct(ctxFor(client, true), request, { messageId: idOf(request), body: 'Other.' }))).toBe('Only its author edits a message.');
		expect(reasonOf(editMessageAct(ctxFor(ana), request, { messageId: idOf(request), body: ' ' }))).toBe('A message needs a body.');
	});
});

describe('a conversation on an answer is validated, resolved and reopened by a person', () => {
	const posted = () => ok(postOnFieldAct(ctxFor(ana), open(), '00-need.situation', null, 'How many bags a week?'));
	const thread = (request: EvolutionRequest) => request.fieldThreads[0];

	it('settles the conversation a reply belongs to, the thread answered once every one is, across a reload', () => {
		const asked = posted();
		const opener = thread(asked).messages[0].id;
		const replied = ok(postOnFieldAct(ctxFor(bo), asked, '00-need.situation', null, 'About thirty.', opener));
		const reply = thread(replied).messages[1].id;
		const resolved = ok(ruleTopicAct(ctxFor(bo), replied, { messageId: reply, ruling: 'resolved' }));
		expect(thread(resolved).messages[0].ruling).toMatchObject({ state: 'resolved', by: 'bo' });
		expect(thread(resolved).state).toBe('answered');
		const reread = parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [resolved] })), 'p').requests[0];
		expect(reread.fieldThreads[0].messages[0].ruling?.state).toBe('resolved');
		const second = ok(postOnFieldAct(ctxFor(ana), resolved, '00-need.situation', null, 'And on Sundays?'));
		expect(thread(second).state).toBe('open');
	});

	it('reopens a resolved one on a click or a reply, keeps a validated one validated, and never lets the model rule', () => {
		const asked = posted();
		const opener = thread(asked).messages[0].id;
		const resolved = ok(ruleTopicAct(ctxFor(ana), asked, { messageId: opener, ruling: 'resolved' }));
		expect(thread(ok(ruleTopicAct(ctxFor(bo), resolved, { messageId: opener, ruling: 'open' }))).messages[0].ruling).toBeUndefined();
		const answered = ok(postOnFieldAct(ctxFor(bo), resolved, '00-need.situation', null, 'Thirty.', opener));
		expect(thread(answered).messages[0].ruling).toBeUndefined();
		expect(thread(answered).state).toBe('open');
		const validated = ok(ruleTopicAct(ctxFor(bo), asked, { messageId: opener, ruling: 'validated' }));
		const after = ok(postOnFieldAct(ctxFor(ana), validated, '00-need.situation', null, 'Thanks.', opener));
		expect(thread(after).messages[0].ruling?.state).toBe('validated');
		expect(reasonOf(ruleTopicAct(ctxFor(client, true), asked, { messageId: opener, ruling: 'resolved' }))).toBe('The model replies in a thread; it never rules on it.');
	});
});

describe('an answer edits until the freeze, each save a new version [criterion:ac-leaf-ac-evo-form-edit-anytime]', () => {
	const key = '00-need.situation';
	const written = () => ok(updateNeedAct(ctxFor(ana), open(), { situation: 'Bags are never picked up.' }));

	it('opens the answers at the four steps of prose and at the Impact analysis, and nowhere after the freeze', () => {
		expect((['need', 'solution', 'functional_spec', 'technical_spec', 'impact_analysis'] as const).every(answersEditableAt)).toBe(true);
		expect((['build', 'approval', 'deployment'] as const).some(answersEditableAt)).toBe(false);
	});

	it('writes a validated answer again as a new version whose earlier validation reads outdated', () => {
		const validated = ok(validateFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.' }));
		const rewritten = ok(updateNeedAct(ctxFor(ana), validated, { situation: 'Three bags a week are never picked up.' }));
		expect(versionsOf(rewritten, key).map((v) => v.value)).toEqual(['Three bags a week are never picked up.', 'Bags are never picked up.']);
		expect(fieldValidationOf(rewritten, key)).toMatchObject({ status: 'outdated', validations: [], outdatedValidation: { by: 'bo' } });
	});

	it('clears a refusal on the new version, kept on the one it was given to', () => {
		const refused = ok(refuseFieldAct(ctxFor(bo), written(), { key, liveValue: 'Bags are never picked up.', reason: 'How many a week?' }));
		const rewritten = ok(updateNeedAct(ctxFor(ana), refused, { situation: 'Three bags a week are never picked up.' }));
		expect(fieldValidationOf(rewritten, key)).toMatchObject({ status: 'unvalidated', refusal: null, versionCount: 2 });
		expect(rewritten.fieldValidations.filter((v) => v.verdict === 'refused').map((v) => v.versionId)).toEqual([versionsOf(rewritten, key)[1].id]);
	});
});

describe('an answer needs as many people as the request asks for (ac-evo-req-validations-per-answer, ac-evo-form-validators)', () => {
	const key = '00-need.situation';
	const written = (over: Partial<EvolutionRequest> = {}) => ok(updateNeedAct(ctxFor(ana), open(over), { situation: 'Bags are never picked up.' }));
	const validate = (actor: Actor, request: EvolutionRequest) => ok(validateFieldAct(ctxFor(actor), request, { key, liveValue: 'Bags are never picked up.' }));

	it('reads an answer validated only once enough different people stand behind its current version', () => {
		let request = validate(bo, written({ validationsPerAnswer: 2 }));
		expect(fieldValidationOf(request, key)).toMatchObject({ status: 'unvalidated', needed: 2, validations: [{ by: 'bo' }] });
		// The same person validating twice counts once.
		request = validate(bo, request);
		expect(fieldValidationOf(request, key).validations).toHaveLength(1);
		request = validate(ana, request);
		expect(fieldValidationOf(request, key)).toMatchObject({ status: 'validated', validations: [{ by: 'bo' }, { by: 'ana' }] });
		// One validation is enough by default, as it always was.
		expect(fieldValidationOf(validate(bo, written()), key).status).toBe('validated');
	});

	it('is set from one up to the members of the workspace, and never by a viewer', () => {
		expect(ok(updateRequestAct(ctxFor(ana), open(), { validationsPerAnswer: 2 }, 3)).validationsPerAnswer).toBe(2);
		expect(reasonOf(updateRequestAct(ctxFor(ana), open(), { validationsPerAnswer: 0 }, 3))).toBe('An answer needs at least one validation.');
		expect(reasonOf(updateRequestAct(ctxFor(ana), open(), { validationsPerAnswer: 1.5 }, 3))).toBe('An answer needs at least one validation.');
		expect(reasonOf(updateRequestAct(ctxFor(ana), open(), { validationsPerAnswer: 4 }, 3))).toBe('No more validations than members who can give them: this workspace holds 3.');
		expect(reasonOf(updateRequestAct(ctxFor(ana), open(), { validationsPerAnswer: 2 }, 1))).toBe('No more validations than members who can give them: this workspace holds 1.');
		expect(reasonOf(updateRequestAct(ctxFor(viewer), open(), { validationsPerAnswer: 2 }, 3))).toBe(
			'A viewer reads and comments, but does not change how a request is validated.'
		);
	});

	it('keeps one validation for a request stored before the setting existed', () => {
		const { validationsPerAnswer: _dropped, ...stored } = open();
		expect(parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [stored] })), 'p').requests[0].validationsPerAnswer).toBe(1);
		const two = open({ validationsPerAnswer: 2 });
		expect(parseEvolutionDraft(JSON.parse(JSON.stringify({ projectId: 'p', requests: [two] })), 'p').requests[0].validationsPerAnswer).toBe(2);
	});
});
