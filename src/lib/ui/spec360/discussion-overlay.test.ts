import { describe, expect, it } from 'vitest';
import { applyDiscussionAct, emptyDiscussions, type ActContext } from '$domain/discussions';
import { resolvedAct, shownDiscussions } from './discussion-overlay';

const me = { email: 'me@x.io', name: 'Me' };
const ctx = (n: number): ActContext => ({ author: me, at: `2026-10-27T10:00:0${n}.000Z`, threadId: `local-${n}`, messageId: `local-${n}-m` });

describe('the discussions while acts are on their way', () => {
	it('shows a new thread and a reply to it at once, before either is saved', () => {
		const doc = shownDiscussions(
			emptyDiscussions(),
			[
				{ act: { kind: 'open', anchor: 'core:c1', anchorTitle: 'Selling', text: 'Why two carts?', notify: [] }, ctx: ctx(1) },
				{ act: { kind: 'reply', threadId: 'local-1', text: 'One per shop.' }, ctx: ctx(2) }
			],
			{}
		);
		expect(doc.threads).toHaveLength(1);
		expect(doc.threads[0].messages.map((m) => m.text)).toEqual(['Why two carts?', 'One per shop.']);
	});

	it('names a thread opened here by the id the server gave it once saved, so a reply queued on it still reads', () => {
		const opened = applyDiscussionAct(emptyDiscussions(), { kind: 'open', anchor: 'core:c1', anchorTitle: 'Selling', text: 'Why?', notify: [] }, { ...ctx(1), threadId: 'srv-9' });
		if (!opened.ok) throw new Error(opened.refusal);
		const reply = { act: { kind: 'reply' as const, threadId: 'local-1', text: 'Because.' }, ctx: ctx(2) };
		expect(resolvedAct(reply.act, { 'local-1': 'srv-9' })).toMatchObject({ threadId: 'srv-9' });
		const doc = shownDiscussions(opened.document, [reply], { 'local-1': 'srv-9' });
		expect(doc.threads[0].messages).toHaveLength(2);
	});

	it('leaves out an act the rules refuse, and resolves at once', () => {
		const opened = applyDiscussionAct(emptyDiscussions(), { kind: 'open', anchor: 'core:c1', anchorTitle: 'Selling', text: 'Why?', notify: [] }, ctx(1));
		if (!opened.ok) throw new Error(opened.refusal);
		const doc = shownDiscussions(
			opened.document,
			[
				{ act: { kind: 'reply', threadId: 'nowhere', text: 'Lost.' }, ctx: ctx(2) },
				{ act: { kind: 'resolve', threadId: 'local-1' }, ctx: ctx(3) }
			],
			{}
		);
		expect(doc.threads[0].state).toBe('resolved');
		expect(doc.threads[0].messages).toHaveLength(1);
	});
});
