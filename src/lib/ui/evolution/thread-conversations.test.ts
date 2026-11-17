import { describe, expect, it } from 'vitest';
import { conversationsOf } from './thread-conversations';

/** Replies stand under the message that opened their conversation, one level deep (ac-evo-fthread-reply). */
const at = (id: string, replyTo?: string) => ({ id, ...(replyTo ? { replyTo } : {}) });
const shape = (messages: ReturnType<typeof at>[]) => conversationsOf(messages).map((c) => [c.opener.id, c.replies.map((r) => r.id)]);

describe('a thread reads as conversations [criterion:ac-leaf-ac-evo-fthread-reply]', () => {
	it('puts each reply under the message it answers, and keeps messages of their own in order of time', () => {
		expect(shape([at('m1'), at('m2', 'm1'), at('m3')])).toEqual([
			['m1', ['m2']],
			['m3', []]
		]);
	});

	it('puts a reply to a reply in the same conversation, one level deep, in order of time', () => {
		expect(shape([at('m1'), at('m2', 'm1'), at('m3'), at('m4', 'm2'), at('m5', 'm1')])).toEqual([
			['m1', ['m2', 'm4', 'm5']],
			['m3', []]
		]);
	});

	it('reads a reply whose message the thread does not hold as a message of its own', () => {
		expect(shape([at('m1'), at('m2', 'gone')])).toEqual([
			['m1', []],
			['m2', []]
		]);
	});
});
