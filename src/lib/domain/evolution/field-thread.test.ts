import { describe, expect, it } from 'vitest';
import {
	canPostOnField,
	createEvolutionRequest,
	latestThread,
	openThread,
	post,
	type Actor,
	type FieldThread
} from './index';

/**
 * The scenarios the specification declares on "Discuss a field where it
 * stands" (feat-evo-field-thread), transcribed.
 */

const noa: Actor = { id: 'noa', kind: 'person', role: 'member' };
const KEY = '02-problem.statement@feat-a';
const msg = (n: number, author = 'noa') => ({
	id: `m${n}`,
	author,
	authorKind: 'person' as const,
	body: `message ${n}`,
	postedAt: `2026-09-03T0${n}:00:00Z`
});
const thread = (over: Partial<FieldThread> = {}): FieldThread => ({
	...openThread({ id: 't1', key: KEY, message: msg(1) }),
	...over
});

describe('a thread on a field', () => {
	// f8e0ca09: a message on an answered thread reopens it.
	it('reopens an answered thread when a message arrives', () => {
		const answered = thread({ messages: [msg(1), msg(2)], state: 'answered' });
		expect(canPostOnField(noa, { canComment: true, thread: answered }).ok).toBe(true);
		const reopened = post(answered, msg(3));
		expect(reopened.messages).toHaveLength(3);
		expect(reopened.state).toBe('open');
	});

	// e5e11ef5: no message on a thread that became a change.
	it('takes no message once it became a change', () => {
		const changed = thread({ state: 'turned_into_change', changeValue: 'v2', changedBy: 'noa', changedAt: 'now' });
		expect(canPostOnField(noa, { canComment: true, thread: changed }).ok).toBe(false);
	});

	it('refuses a message without the comment right or without an author', () => {
		expect(canPostOnField(noa, { canComment: false, thread: undefined }).ok).toBe(false);
		expect(canPostOnField({ ...noa, id: '' }, { canComment: true, thread: undefined }).ok).toBe(false);
	});

	it('reads the latest thread of a home', () => {
		const r = createEvolutionRequest({
			fieldThreads: [thread({ id: 't1' }), thread({ id: 't2', key: '02-problem.value@feat-a' }), thread({ id: 't3' })]
		});
		expect(latestThread(r, KEY)?.id).toBe('t3');
		expect(latestThread(r, 'nowhere')).toBeUndefined();
	});
});
