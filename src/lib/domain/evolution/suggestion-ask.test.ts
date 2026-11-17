import { describe, expect, it } from 'vitest';
import { postOnFieldAct, proposeAct, type ActContext, type ActOutcome, type ProposeInput } from './acts';
import { createEvolutionRequest, type Actor, type EvolutionRequest } from './draft';
import { latestThread } from './field-thread';
import { conversationWithAi, threadBoxOf } from './live-exchange';
import { pendingClicksOf, takeNextClick } from './live-session';
import { answerSuggestionAct, sendClickAct, startSessionAct } from './live-session-acts';
import { ASK_IN_SUGGESTION, ONE_QUESTION, answerSuggestion, askAllowed, choicesAllowed, dialogueAfter, questionMarksIn, replaceableBy } from './suggestion-ask';
import { proposalArrival, proposalFates } from './place-arrival';

/**
 * The AI asks what it misses in its suggestion, one question at a time, and the
 * person answers there with one click (ac-evo-live-card-ask,
 * ac-evo-live-one-question); in a thread, each box offers Comment and 'Ask
 * your AI', Enter sends to the AI only where the conversation is with it, and
 * a reply keeps the visibility of what it answers (ac-evo-live-one-box).
 */

const person: Actor = { id: 'ana@team.test', kind: 'person', role: 'member', channel: 'page' };
const viewer: Actor = { ...person, role: 'viewer' };
const ai: Actor = { id: 'ana@team.test', kind: 'ai_client', role: 'member', channel: 'ai_client' };

let counter = 0;
const ctxFor = (actor: Actor, at = '2026-10-25T10:00:00.000Z'): ActContext => ({
	actor,
	at,
	newId: () => `id-${++counter}`,
	soloWorkspace: true,
	validators: null
});
const ok = (outcome: ActOutcome): EvolutionRequest => {
	if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
	return outcome.request;
};
const reasonOf = (outcome: ActOutcome) => (outcome.ok ? null : outcome.reason);
const checks = { sourceExists: (id: string) => id === 'src-1', bannedWords: [] };

const suggest = (request: EvolutionRequest, over: Partial<ProposeInput> = {}, actor: Actor = ai) =>
	proposeAct(
		ctxFor(actor),
		request,
		{
			fieldPath: '00-need.situation',
			leafId: null,
			value: 'Today the customer orders from the products of the day.',
			reasoning: '',
			whatWasRead: 'The feature Order online.',
			whatWasInferred: 'Nothing lets a customer compose a baguette.',
			citedSourceIds: ['src-1'],
			...over
		},
		checks
	);
const WHO = { question: 'Who asks for it?', choices: ['The customers', 'The baker'] };

describe('one question at a time [criterion:ac-leaf-ac-evo-live-one-question]', () => {
	it('counts the questions a text asks by its question marks, Latin or full-width', () => {
		expect(questionMarksIn('Who asks for it?')).toBe(1);
		expect(questionMarksIn('Who asks for it? And does the app exist ?')).toBe(2);
		expect(questionMarksIn('誰？')).toBe(1);
		expect(questionMarksIn('Nothing asked.')).toBe(0);
	});

	it('refuses two questions, more than three answers, or answers with no question', () => {
		expect(askAllowed(WHO).ok).toBe(true);
		const two = askAllowed({ question: 'Who asks for it? Does the app exist?', choices: [] });
		expect(two.ok ? null : two.reason).toBe(ONE_QUESTION);
		const four = askAllowed({ question: 'Who?', choices: ['a', 'b', 'c', 'd'] });
		expect(four.ok ? null : four.reason).toContain('3 answers at most');
		expect(askAllowed({ question: '', choices: ['a'] }).ok).toBe(false);
		expect(reasonOf(suggest(createEvolutionRequest(), { question: 'Who? Where?' }))).toBe(ONE_QUESTION);
	});

	it("refuses an AI message waiting for an answer that asks two things, or a new topic about its own waiting suggestion", () => {
		const request = ok(suggest(createEvolutionRequest()));
		const two = postOnFieldAct(ctxFor(ai), createEvolutionRequest(), '00-need.situation', null, 'Who asks? Does the app exist?', null, { asks: true });
		expect(reasonOf(two)).toBe(ONE_QUESTION);
		const aside = postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'Who asks for it?', null, { asks: true });
		expect(reasonOf(aside)).toBe(ASK_IN_SUGGESTION);
		// A person's message, or an AI note that asks nothing, is never held to it.
		expect(postOnFieldAct(ctxFor(person), request, '00-need.situation', null, 'Who? Why?', null).ok).toBe(true);
		expect(postOnFieldAct(ctxFor(ai), request, '00-need.situation', null, 'I read the order feature.', null).ok).toBe(true);
	});
});

describe('the question lives in the suggestion [criterion:ac-leaf-ac-evo-live-card-ask]', () => {
	it('keeps the question and its answers on the suggestion', () => {
		const [proposal] = ok(suggest(createEvolutionRequest(), WHO)).proposals;
		expect(proposal.ask).toEqual({ question: 'Who asks for it?', choices: ['The customers', 'The baker'] });
		expect(proposal.dialogue).toBeUndefined();
	});

	it('records the answer once, and only on a question that waits', () => {
		const request = ok(suggest(createEvolutionRequest(), WHO));
		const id = request.proposals[0].id;
		const answered = answerSuggestion(request, person.id, id, ' The customers ', '2026-10-25T10:01:00.000Z');
		if (!answered.ok) throw new Error(answered.reason);
		expect(answered.proposal.ask?.answer).toEqual({ body: 'The customers', by: person.id, at: '2026-10-25T10:01:00.000Z' });
		expect(answerSuggestion(answered.request, person.id, id, 'again', 'now').ok).toBe(false);
		expect(answerSuggestion(request, person.id, id, '  ', 'now').ok).toBe(false);
		const plain = ok(suggest(createEvolutionRequest()));
		const nothing = answerSuggestion(plain, person.id, plain.proposals[0].id, 'x', 'now');
		expect(nothing.ok ? null : nothing.reason).toBe('Lyriks asked nothing in this suggestion.');
	});

	it('the answer goes to the AI as a prefill of that field, session or not, never from a viewer', () => {
		const suggested = ok(suggest(createEvolutionRequest(), WHO));
		const id = suggested.proposals[0].id;
		// Without a session it waits for the one the copied prompt opens (ac-evo-live-no-session).
		expect(pendingClicksOf(ok(answerSuggestionAct(ctxFor(person), suggested, id, 'The customers')), person.id)).toMatchObject([{ kind: 'prefill', proposalId: id, state: 'waiting' }]);
		const opened = ok(startSessionAct(ctxFor(ai), suggested));
		expect(answerSuggestionAct(ctxFor(viewer), opened, id, 'The customers').ok).toBe(false);
		expect(answerSuggestionAct(ctxFor(ai), opened, id, 'The customers').ok).toBe(false);
		const sent = ok(answerSuggestionAct(ctxFor(person), opened, id, 'The customers'));
		const [click] = pendingClicksOf(sent, person.id);
		expect(click).toMatchObject({ kind: 'prefill', fieldPath: '00-need.situation', leafId: null, proposalId: id, state: 'waiting' });
		expect(sent.proposals[0].ask?.answer?.body).toBe('The customers');
	});

	it('the answer goes with the rest of the section, which the AI fills too [criterion:ac-leaf-ac-evo-live-card-ask]', () => {
		const opened = ok(startSessionAct(ctxFor(ai), ok(suggest(createEvolutionRequest(), WHO))));
		const section = ['00-need.situation', '00-need.symptoms', '00-need.cost'];
		const sent = ok(answerSuggestionAct(ctxFor(person), opened, opened.proposals[0].id, 'The customers', section));
		expect(pendingClicksOf(sent, person.id)[0].section).toEqual(section);
	});

	it("the AI's next suggestion replaces its own in place and keeps what was asked and answered", () => {
		const opened = ok(startSessionAct(ctxFor(ai), ok(suggest(createEvolutionRequest(), WHO))));
		const first = opened.proposals[0];
		// Still unanswered: one suggestion per field, the person decides it first.
		expect(reasonOf(suggest(opened))).toContain('already waiting');
		const answered = ok(answerSuggestionAct(ctxFor(person), opened, first.id, 'The customers'));
		expect(replaceableBy(answered.proposals[0], ai.id)).toBe(true);
		const taken = takeNextClick(answered, person.id, '2026-10-25T10:02:00.000Z')!;
		const rewritten = ok(suggest(taken.request, { value: 'Today the customers order from the products of the day.' }));
		expect(rewritten.proposals).toHaveLength(1);
		const [next] = rewritten.proposals;
		expect(next.id).not.toBe(first.id);
		expect(next.value).toBe('Today the customers order from the products of the day.');
		expect(next.ask).toBeUndefined();
		expect(next.dialogue).toEqual([{ question: 'Who asks for it?', answer: 'The customers', by: person.id, at: '2026-10-25T10:00:00.000Z' }]);
		expect(dialogueAfter(next)).toEqual(next.dialogue);
		// A link handed out to the first one still lands on this one (ac-evo-link-arrival-only).
		expect(next.replaces).toEqual([first.id]);
		expect(proposalArrival(first.id, (id) => id === next.id, proposalFates(rewritten))).toEqual({ kind: 'waiting', id: next.id });
		// Another caller's suggestion is never replaced on its behalf.
		expect(replaceableBy(answered.proposals[0], 'someone@else.test')).toBe(false);
	});
});

describe('Comment and Ask your AI on a new topic, one Reply on every reply [criterion:ac-leaf-ac-evo-live-one-box]', () => {
	it('a new topic sent to the AI stays between the person and their AI', () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const asked = ok(sendClickAct(ctxFor(person), opened, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'What is missing?' }));
		expect(latestThread(asked, '00-need.situation')?.messages[0].privateTo).toBe(person.id);
	});

	it("an answer to the AI's question everyone reads is one message everyone reads, and the click carries it", () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const question = ok(postOnFieldAct(ctxFor(ai), opened, '00-need.situation', null, 'Who asks for it?', null, { asks: true }));
		const questionId = latestThread(question, '00-need.situation')!.messages[0].id;
		const answered = ok(sendClickAct(ctxFor(person), question, { kind: 'ask', fieldPath: '00-need.situation', leafId: null, body: 'The customers', replyTo: questionId }));
		const messages = latestThread(answered, '00-need.situation')!.messages;
		expect(messages).toHaveLength(2);
		expect(messages[1].privateTo).toBeUndefined();
		expect(pendingClicksOf(answered, person.id)[0].messageId).toBe(messages[1].id);
	});

	it('tells a conversation the AI takes part in from one between people', () => {
		const messages = [
			{ id: 'p1', authorKind: 'person', body: 'Gluten free?' },
			{ id: 'p2', authorKind: 'person', body: 'On order.', replyTo: 'p1' },
			{ id: 'a1', authorKind: 'ai_client', body: 'Who asks for it?' },
			{ id: 'p3', authorKind: 'person', body: 'Note to self', privateTo: person.id }
		];
		expect(conversationWithAi(messages, 'p1')).toBe(false);
		expect(conversationWithAi(messages, 'a1')).toBe(true);
		expect(conversationWithAi(messages, 'p3')).toBe(true);
	});

	describe('what each box sends', () => {
		const messages = [
			{ id: 'p1', authorKind: 'person', body: 'Gluten free?' },
			{ id: 'a1', authorKind: 'ai_client', body: 'Who asks for it?' },
			{ id: 'x1', authorKind: 'person', body: 'What is missing?', privateTo: person.id }
		];

		it('a new topic offers Comment and Ask your AI, and Enter comments', () => {
			expect(threadBoxOf(messages, null, true)).toEqual({ replyToAi: false });
		});

		it('a reply between people offers one Reply, which stays among them', () => {
			expect(threadBoxOf(messages, 'p1', true)).toEqual({ replyToAi: false });
		});

		it("under the AI's message, one Reply addressed to the AI, session or not", () => {
			expect(threadBoxOf(messages, 'a1', true)).toEqual({ replyToAi: true });
		});

		it('under the exchange with the AI, the same one Reply', () => {
			expect(threadBoxOf(messages, 'x1', true)).toEqual({ replyToAi: true });
		});

		it('outside a request page there is no AI to reply to: a comment everywhere', () => {
			for (const opener of [null, 'p1', 'a1', 'x1']) expect(threadBoxOf(messages, opener, false)).toEqual({ replyToAi: false });
		});
	});
});

describe('answers as buttons, one to click or several to tick [criterion:ac-leaf-ac-evo-live-choices]', () => {
	it('caps one-answer questions at three buttons and several-answer ones at six boxes', () => {
		expect(choicesAllowed(['a', 'b', 'c']).ok).toBe(true);
		expect(choicesAllowed(['a', 'b', 'c', 'd']).ok).toBe(false);
		expect(choicesAllowed(['a', 'b', 'c', 'd', 'e', 'f'], true).ok).toBe(true);
		expect(choicesAllowed(['a', 'b', 'c', 'd', 'e', 'f', 'g'], true).ok).toBe(false);
	});

	it("the AI's waiting question in a thread keeps its answers and whether it takes several", () => {
		const opened = ok(startSessionAct(ctxFor(ai), createEvolutionRequest()));
		const asked = ok(postOnFieldAct(ctxFor(ai), opened, '00-need.situation', null, 'Which channels do customers use?', null, { asks: true, choices: ['Shop', 'Phone', 'App'], multiple: true }));
		expect(latestThread(asked, '00-need.situation')!.messages[0]).toMatchObject({ awaitsAnswer: true, choices: ['Shop', 'Phone', 'App'], multiple: true });
		const tooMany = postOnFieldAct(ctxFor(ai), opened, '00-need.situation', null, 'Yes or no?', null, { asks: true, choices: ['Yes', 'No', 'Maybe', 'Later'] });
		expect(reasonOf(tooMany)).toContain('3 answers at most');
	});

	it('a suggestion question that takes several keeps it on its ask', () => {
		const suggested = ok(suggest(createEvolutionRequest(), { question: 'Which channels?', choices: ['Shop', 'Phone', 'App', 'Web'], multiple: true }));
		expect(suggested.proposals[0].ask).toMatchObject({ choices: ['Shop', 'Phone', 'App', 'Web'], multiple: true });
	});
});
