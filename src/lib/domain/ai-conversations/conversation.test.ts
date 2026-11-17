import { describe, expect, it } from 'vitest';
import {
	addAiAnswer,
	chatTurn,
	conversationOf,
	conversationsOf,
	decideProposal,
	emptyAiConversations,
	markPublished,
	parseAiConversations,
	publishPlaces,
	startConversation,
	titleOf,
	writeInConversation,
	type AiConversationsDocument
} from './conversation';

const AT = '2026-11-14T10:00:00.000Z';
const LATER = '2026-11-14T11:00:00.000Z';
const context = { anchor: 'feature:feat-1', title: 'Run a test', href: '/projects/p/spec/features/feat-1' };

function started(personId = 'ana@x.io', text = 'Which rules guard the start of a run?', id = 'c1'): AiConversationsDocument {
	const outcome = startConversation(emptyAiConversations(), personId, { text, context }, { conversationId: id, messageId: `${id}-m1` }, AT);
	if (!outcome.ok) throw new Error(outcome.reason);
	return outcome.document;
}

describe('a question opens a private conversation [criterion:cc5f46cb]', () => {
	it('titles it with the start of the question and keeps the page it was asked from', () => {
		const c = conversationOf(started(), 'ana@x.io', 'c1')!;
		expect(c.title).toBe('Which rules guard the start of a run?');
		expect(c.context).toEqual(context);
		expect(c.messages).toHaveLength(1);
	});

	it('refuses an empty question', () => {
		const outcome = startConversation(emptyAiConversations(), 'ana@x.io', { text: '  ', context: null }, { conversationId: 'c', messageId: 'm' }, AT);
		expect(outcome.ok).toBe(false);
	});

	it('cuts a long first line at a word', () => {
		expect(titleOf(`${'word '.repeat(30)}\nsecond line`).endsWith('…')).toBe(true);
	});
});

describe('only my own conversations [criterion:13235e8e]', () => {
	it('lists the person their own conversations alone, latest first', () => {
		let doc = started('ana@x.io', 'First', 'c1');
		const second = startConversation(doc, 'ana@x.io', { text: 'Second', context: null }, { conversationId: 'c2', messageId: 'm2' }, LATER);
		if (!second.ok) throw new Error();
		const other = startConversation(second.document, 'bob@x.io', { text: 'Bob asks', context: null }, { conversationId: 'c3', messageId: 'm3' }, LATER);
		if (!other.ok) throw new Error();
		doc = other.document;
		expect(conversationsOf(doc, 'ANA@x.io').map((c) => c.id)).toEqual(['c2', 'c1']);
		expect(conversationsOf(doc, 'bob@x.io').map((c) => c.id)).toEqual(['c3']);
	});

	it("reads someone else's conversation as not found, and refuses a write in it", () => {
		const doc = started('ana@x.io');
		expect(conversationOf(doc, 'owner@x.io', 'c1')).toBeNull();
		const outcome = writeInConversation(doc, 'owner@x.io', 'c1', 'Hello', 'm', AT, false);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.notFound).toBe(true);
	});
});

describe('a conversation reads like a chat [criterion:e56b49e5]', () => {
	it('refuses a second message while the AI holds the last one', () => {
		const outcome = writeInConversation(started(), 'ana@x.io', 'c1', 'And?', 'm2', LATER, true);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('Your AI is still on your last message.');
	});

	it('follows the turn from the click of the last message', () => {
		const c = conversationOf(started(), 'ana@x.io', 'c1')!;
		expect(chatTurn(c, () => ({ state: 'waiting' }))).toBe('waiting');
		expect(chatTurn(c, () => ({ state: 'taken' }))).toBe('taken');
		expect(chatTurn(c, () => ({ state: 'answered', answeredNothing: true }))).toBe('answered_nothing');
	});
});

describe('the AI asks when it cannot tell [criterion:8fe54838]', () => {
	it('reads a question back as asked_back', () => {
		const outcome = addAiAnswer(started(), 'ana@x.io', 'c1', { text: 'Which run do you mean?', asks: true }, 'a1', LATER);
		if (!outcome.ok) throw new Error(outcome.reason);
		expect(chatTurn(outcome.conversation, () => null)).toBe('asked_back');
	});
});

describe('a change is written only once validated [criterion:8ec8310b]', () => {
	const proposal = { featureId: 'feat-1', summary: 'Viewers read the rules', operations: [{ kind: 'update_action', actionId: 'a' }] };

	it('refuses a change without its operations', () => {
		const outcome = addAiAnswer(started(), 'ana@x.io', 'c1', { text: 'Here', proposal: { ...proposal, operations: [] } }, 'a1', LATER);
		expect(outcome.ok).toBe(false);
	});

	it('is proposed, then decided once', () => {
		const answered = addAiAnswer(started(), 'ana@x.io', 'c1', { text: 'Here is the change', proposal }, 'a1', LATER);
		if (!answered.ok) throw new Error(answered.reason);
		expect(answered.message.proposal?.state).toBe('proposed');
		const applied = decideProposal(answered.document, 'ana@x.io', 'c1', 'a1', 'applied', LATER);
		if (!applied.ok) throw new Error(applied.reason);
		expect(applied.message.proposal?.state).toBe('applied');
		expect(decideProposal(applied.document, 'ana@x.io', 'c1', 'a1', 'rejected', LATER).ok).toBe(false);
	});
});

describe('publish on the closest block [criterion:bbab6a2f]', () => {
	it('offers the suggested block first, then the page asked from, then the Overview', () => {
		const answered = addAiAnswer(started(), 'ana@x.io', 'c1', { text: 'It is a rule of the run', place: { anchor: 'action:feat-1:run', title: 'Start a run' } }, 'a1', LATER);
		if (!answered.ok) throw new Error(answered.reason);
		const places = publishPlaces(answered.conversation, 'a1');
		expect(places.map((p) => p.anchor)).toEqual(['action:feat-1:run', 'feature:feat-1', 'overview:what']);
		expect(places[0].suggested).toBe(true);
	});

	it('publishes a message once', () => {
		const pub = { anchor: 'feature:feat-1', title: 'Run a test', threadId: 't1', at: LATER };
		const once = markPublished(started(), 'ana@x.io', 'c1', 'c1-m1', pub);
		if (!once.ok) throw new Error(once.reason);
		expect(markPublished(once.document, 'ana@x.io', 'c1', 'c1-m1', pub).ok).toBe(false);
	});
});

describe('the stored document', () => {
	it('reads back what it saved and leaves out what it cannot read', () => {
		const doc = started();
		const parsed = parseAiConversations(JSON.parse(JSON.stringify({ ...doc, conversations: [...doc.conversations, { id: 'x' }] })));
		expect(parsed.conversations).toEqual(doc.conversations);
		expect(parseAiConversations(null).conversations).toEqual([]);
	});
});

describe('each message says whether it reached my AI [criterion:03172878]', () => {
	it('reads lost with no click, then follows the click', async () => {
		const { deliveryOf } = await import('./conversation');
		const m = { id: 'm', role: 'person' as const, text: 'Hi', at: AT };
		expect(deliveryOf(m, null)).toBe('lost');
		expect(deliveryOf(m, { state: 'waiting' })).toBe('waiting');
		expect(deliveryOf(m, { state: 'taken' })).toBe('taken');
		expect(deliveryOf(m, { state: 'answered' })).toBe('answered');
		expect(deliveryOf(m, { state: 'answered', answeredNothing: true })).toBe('nothing');
		expect(deliveryOf({ ...m, withdrawn: true }, { state: 'withdrawn' })).toBe('withdrawn');
	});
});

describe('a conversation can be deleted, unless it changed the specification [criterion:e375c668]', () => {
	it('deletes the person\'s own conversation, never someone else\'s', async () => {
		const { deleteConversation } = await import('./conversation');
		const doc = started('ana@x.io');
		const other = deleteConversation(doc, 'owner@x.io', 'c1');
		expect(other.ok).toBe(false);
		const done = deleteConversation(doc, 'ana@x.io', 'c1');
		if (!done.ok) throw new Error(done.reason);
		expect(done.document.conversations).toEqual([]);
	});

	it('keeps a conversation whose change was written into the specification', async () => {
		const { deleteConversation } = await import('./conversation');
		const proposal = { featureId: 'feat-1', summary: 'S', operations: [{ kind: 'x' }] };
		const answered = addAiAnswer(started(), 'ana@x.io', 'c1', { text: 'Here', proposal }, 'a1', LATER);
		if (!answered.ok) throw new Error(answered.reason);
		const applied = decideProposal(answered.document, 'ana@x.io', 'c1', 'a1', 'applied', LATER);
		if (!applied.ok) throw new Error(applied.reason);
		const refused = deleteConversation(applied.document, 'ana@x.io', 'c1');
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain('changed the specification');
	});
});
