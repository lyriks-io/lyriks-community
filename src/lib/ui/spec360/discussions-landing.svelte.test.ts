import { describe, expect, it } from 'vitest';
import { applyDiscussionAct, emptyDiscussions, type DiscussionsDocument } from '$domain/discussions';
import { SpecDiscussions } from './discussions.svelte';

const carmen = { email: 'carmen@acme.test', name: 'Carmen R.' };

function held(): DiscussionsDocument {
	const out = applyDiscussionAct(
		emptyDiscussions(),
		{ kind: 'open', anchor: 'action:f1:a1', anchorTitle: 'Pay', text: 'Who may pay?', notify: [] },
		{ author: carmen, at: '2026-11-05T10:00:00.000Z', threadId: 't1', messageId: 'm0' }
	);
	if (!out.ok) throw new Error(out.refusal);
	return out.document;
}

describe("a link to a conversation opens its block's comments on it [criterion:0bdc1d4f]", () => {
	it("opens the comments of the conversation's block and asks them to land on the message named", () => {
		const discussions = new SpecDiscussions('p', carmen, [], { document: held(), revision: 1 });
		discussions.revealThread('t1', 'm0');
		expect(discussions.openAnchor).toBe('action:f1:a1');
		expect(discussions.landing).toEqual({ threadId: 't1', messageId: 'm0' });
	});

	it('lands on the whole conversation when the link names no message', () => {
		const discussions = new SpecDiscussions('p', carmen, [], { document: held(), revision: 1 });
		discussions.revealThread('t1');
		expect(discussions.landing).toEqual({ threadId: 't1', messageId: null });
	});

	it('marks nothing for a conversation the page no longer holds', () => {
		const discussions = new SpecDiscussions('p', carmen, [], { document: held(), revision: 1 });
		discussions.revealThread('t1', 'm0');
		discussions.revealThread('gone', null);
		expect(discussions.landing).toBeNull();
	});
});
