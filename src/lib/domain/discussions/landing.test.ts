import { describe, expect, it } from 'vitest';
import {
	aiAnswerAuthor,
	applyDiscussionAct,
	discussionEvents,
	discussionHref,
	emptyDiscussions,
	type DiscussionAct,
	type DiscussionAuthor,
	type DiscussionsDocument
} from './index';

const carmen: DiscussionAuthor = { email: 'carmen@acme.test', name: 'Carmen R.' };
const sarah: DiscussionAuthor = { email: 'sarah@acme.test', name: 'Sarah K.' };
const lyriks = aiAnswerAuthor(carmen.email, { author: carmen });

function play(steps: [DiscussionAct, DiscussionAuthor][]): DiscussionsDocument {
	let doc = emptyDiscussions();
	steps.forEach(([act, author], i) => {
		const out = applyDiscussionAct(doc, act, { author, at: `2026-11-05T1${i}:00:00.000Z`, threadId: 't1', messageId: `m${i}` });
		if (!out.ok) throw new Error(out.refusal);
		doc = out.document;
	});
	return doc;
}

describe('a link to a conversation names the message it lands on [criterion:0bdc1d4f]', () => {
	it('carries the message after the thread, and no fragment the router would replay over the landing', () => {
		expect(discussionHref('shop-1', 'action:f1:a1', 't1', 'm2')).toBe('/projects/shop-1/spec/features/f1?discussion=t1&message=m2');
		expect(discussionHref('shop-1', 'product', 't1')).toBe('/projects/shop-1/spec?discussion=t1');
	});

	it("lands a reply's notification on the reply, an opening or a resolution on the conversation", () => {
		const doc = play([
			[{ kind: 'open', anchor: 'product', anchorTitle: 'The product', text: 'Who is it for?', notify: [] }, carmen],
			[{ kind: 'reply', threadId: 't1', text: 'Small shops.' }, lyriks],
			[{ kind: 'resolve', threadId: 't1' }, sarah]
		]);
		const events = discussionEvents(doc, 'shop-1');
		expect(events.find((e) => e.kind === 'reply')!.href).toBe('/projects/shop-1/spec?discussion=t1&message=m1');
		expect(events.find((e) => e.kind === 'opened')!.href).toBe('/projects/shop-1/spec?discussion=t1');
		expect(events.find((e) => e.kind === 'resolved')!.href).toBe('/projects/shop-1/spec?discussion=t1');
	});
});
