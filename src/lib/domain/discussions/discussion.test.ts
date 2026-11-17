import { describe, expect, it } from 'vitest';
import {
	AI_AUTHOR_PREFIX,
	aiAnswerAuthor,
	aiTakesPart,
	anchorTally,
	applyDiscussionAct,
	cleanNotify,
	emptyDiscussions,
	openDiscussionCount,
	parseDiscussionAct,
	parseDiscussions,
	participantsOf,
	threadsOn,
	type ActContext,
	type DiscussionsDocument
} from './index';

const carmen = { email: 'carmen@acme.test', name: 'Carmen R.' };
const sarah = { email: 'sarah@acme.test', name: 'Sarah K.' };

let n = 0;
const ctx = (author = carmen, at = '2026-10-26T10:00:00.000Z'): ActContext => {
	n += 1;
	return { author, at, threadId: `t${n}`, messageId: `m${n}` };
};

function opened(doc: DiscussionsDocument = emptyDiscussions(), anchor = 'rule:feat-a:r1') {
	const out = applyDiscussionAct(
		doc,
		{ kind: 'open', anchor, anchorTitle: 'Rounding half-up', text: '  Which rounding do we keep?  ', notify: ['Sarah@acme.test', 'carmen@acme.test', 'sarah@acme.test'] },
		ctx()
	);
	if (!out.ok) throw new Error(out.refusal);
	return out;
}

describe('opening a discussion', () => {
	it('starts an open thread on the element, its message trimmed, its author never notified', () => {
		const { document, thread } = opened();
		expect(thread.state).toBe('open');
		expect(thread.anchor).toBe('rule:feat-a:r1');
		expect(thread.messages[0].text).toBe('Which rounding do we keep?');
		expect(thread.notify).toEqual(['sarah@acme.test']);
		expect(threadsOn(document, 'rule:feat-a:r1')).toHaveLength(1);
		expect(openDiscussionCount(document)).toBe(1);
	});

	it('refuses an empty message, an unknown element and an anonymous author', () => {
		const doc = emptyDiscussions();
		const open = (anchor: string, text: string) => ({ kind: 'open' as const, anchor, anchorTitle: '', text, notify: [] });
		expect(applyDiscussionAct(doc, open('problem', '   '), ctx())).toMatchObject({ ok: false });
		expect(applyDiscussionAct(doc, open('nowhere:x', 'Hello'), ctx())).toMatchObject({ ok: false });
		expect(applyDiscussionAct(doc, open('problem', 'Hello'), ctx({ email: ' ', name: '' }))).toMatchObject({ ok: false });
	});

	it('keeps several threads on one element', () => {
		const first = opened();
		const second = opened(first.document);
		expect(anchorTally(second.document, 'rule:feat-a:r1')).toEqual({ total: 2, open: 2 });
	});
});

describe('replying, resolving, reopening', () => {
	it('appends a reply without changing the state', () => {
		const { document, thread } = opened();
		const out = applyDiscussionAct(document, { kind: 'reply', threadId: thread.id, text: 'Asking the firm today.' }, ctx(sarah));
		expect(out.ok && out.thread.messages.map((m) => m.author.name)).toEqual(['Carmen R.', 'Sarah K.']);
		expect(out.ok && out.thread.state).toBe('open');
	});

	it('resolves then reopens, and keeps who did it', () => {
		const { document, thread } = opened();
		const resolved = applyDiscussionAct(document, { kind: 'resolve', threadId: thread.id }, ctx(sarah));
		if (!resolved.ok) throw new Error(resolved.refusal);
		expect(resolved.thread.state).toBe('resolved');
		expect(openDiscussionCount(resolved.document)).toBe(0);
		expect(anchorTally(resolved.document, thread.anchor)).toEqual({ total: 1, open: 0 });

		const again = applyDiscussionAct(resolved.document, { kind: 'resolve', threadId: thread.id }, ctx());
		expect(again).toMatchObject({ ok: false });

		const reopened = applyDiscussionAct(resolved.document, { kind: 'reopen', threadId: thread.id }, ctx());
		if (!reopened.ok) throw new Error(reopened.refusal);
		expect(reopened.thread.state).toBe('open');
		expect(reopened.thread.rulings.map((r) => [r.state, r.by.name])).toEqual([
			['resolved', 'Sarah K.'],
			['reopened', 'Carmen R.']
		]);
	});

	it('refuses an act on a thread that does not exist', () => {
		const out = applyDiscussionAct(emptyDiscussions(), { kind: 'reply', threadId: 'nope', text: 'Hi' }, ctx());
		expect(out).toMatchObject({ ok: false });
	});

	it('never mutates the document it is given', () => {
		const { document } = opened();
		const frozen = JSON.stringify(document);
		applyDiscussionAct(document, { kind: 'resolve', threadId: document.threads[0].id }, ctx());
		expect(JSON.stringify(document)).toBe(frozen);
	});
});

describe('participants and notify', () => {
	it('names the opener, the notified, then the repliers, each once', () => {
		const { document, thread } = opened();
		const out = applyDiscussionAct(document, { kind: 'reply', threadId: thread.id, text: 'Me too' }, ctx({ email: 'lea@acme.test', name: 'Léa P.' }));
		expect(out.ok && participantsOf(out.thread)).toEqual(['carmen@acme.test', 'sarah@acme.test', 'lea@acme.test']);
	});

	it('caps and deduplicates the notified list', () => {
		const many = Array.from({ length: 40 }, (_, i) => `p${i}@acme.test`);
		expect(cleanNotify([...many, 'P1@acme.test'], 'x@acme.test')).toHaveLength(30);
	});
});

describe('reading stored documents and requests', () => {
	it('drops what is malformed and keeps the rest', () => {
		const doc = parseDiscussions({
			threads: [
				{ id: 't1', anchor: 'term:term-1', anchorTitle: 'Term', state: 'resolved', notify: ['a@b'], messages: [{ id: 'm1', author: { email: 'a@b', name: 'A' }, at: 'x', text: 'Hi' }], rulings: [{ state: 'bogus' }] },
				{ id: 't2', anchor: 'not an anchor', messages: [] },
				{ id: 't3', anchor: 'problem', messages: [] }
			]
		});
		expect(doc.threads.map((t) => t.id)).toEqual(['t1']);
		expect(doc.threads[0].state).toBe('resolved');
		expect(doc.threads[0].rulings).toEqual([]);
		expect(parseDiscussions(null).threads).toEqual([]);
	});

	it('reads the four acts and refuses anything else', () => {
		expect(parseDiscussionAct({ kind: 'open', anchor: 'problem', text: 'Hi', notify: ['a@b', 3] })).toEqual({
			ok: true,
			act: { kind: 'open', anchor: 'problem', anchorTitle: '', text: 'Hi', notify: ['a@b'] }
		});
		expect(parseDiscussionAct({ kind: 'reply', threadId: 't', text: 'x' })).toMatchObject({ ok: true });
		expect(parseDiscussionAct({ kind: 'resolve', threadId: 't' })).toMatchObject({ ok: true });
		expect(parseDiscussionAct({ kind: 'reopen' })).toMatchObject({ ok: false });
		expect(parseDiscussionAct({ kind: 'delete', threadId: 't' })).toMatchObject({ ok: false });
	});
});

describe('a reply reaches the AI only in a conversation it takes part in [criterion:ac-leaf-ac-ai-session-ask-block]', () => {
	const ai = { email: `${AI_AUTHOR_PREFIX}claude-client`, name: 'Lyriks · for Carmen R.' };
	const message = (id: string, author: typeof carmen) => ({ id, author, at: '2026-10-26T10:00:00.000Z', text: 'A remark' });
	const never = () => false;

	it('a conversation between people keeps its replies among them', () => {
		expect(aiTakesPart({ messages: [message('m1', carmen), message('m2', sarah)] }, never)).toBe(false);
	});

	it('the AI takes part once it answered there', () => {
		expect(aiTakesPart({ messages: [message('m1', carmen), message('m2', ai)] }, never)).toBe(true);
	});

	it('the AI takes part once a message there was asked of it, before it answers', () => {
		expect(aiTakesPart({ messages: [message('m1', carmen)] }, (id) => id === 'm1')).toBe(true);
	});
});

describe('the AI signs its answer for the person under the name their question reads under [criterion:ac-leaf-ac-ai-session-ask-block]', () => {
	it('with no sign-in, the local operator reads under one name, never their id', () => {
		const question = { author: { email: 'local-operator', name: 'Developer' } };
		expect(aiAnswerAuthor('local-operator', question)).toEqual({ email: `${AI_AUTHOR_PREFIX}local-operator`, name: 'Lyriks · for Developer' });
	});

	it('the name of the question wins over the roster, so the thread shows one name', () => {
		expect(aiAnswerAuthor(carmen.email, { author: carmen }, 'Carmen Roux').name).toBe(`Lyriks · for ${carmen.name}`);
	});

	it('a question it cannot find falls back to the roster name, then to the id', () => {
		expect(aiAnswerAuthor('a@b.io', undefined, 'Ana B.').name).toBe('Lyriks · for Ana B.');
		expect(aiAnswerAuthor('a@b.io', undefined).name).toBe('Lyriks · for a@b.io');
	});

	it('a question written by someone else never lends its name', () => {
		expect(aiAnswerAuthor('a@b.io', { author: sarah }, 'Ana B.').name).toBe('Lyriks · for Ana B.');
	});
});
