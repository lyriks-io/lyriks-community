import { describe, expect, it } from 'vitest';
import {
	canMarkAnswered,
	canPostOnField,
	canTurnIntoChange,
	changeIsRecorded,
	createEvolutionRequest,
	latestThread,
	markAnswered,
	openThread,
	openThreadCount,
	post,
	turnIntoChange,
	type Actor,
	type FieldThread
} from './index';

/**
 * The scenarios the specification declares on "Discuss a field where it
 * stands" (feat-evo-field-thread), transcribed.
 */

const noa: Actor = { id: 'noa', kind: 'person', role: 'member' };
const aiClient: Actor = { id: 'mcp-1', kind: 'ai_client', role: 'member' };
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
		const answered = markAnswered(thread({ messages: [msg(1), msg(2)] }));
		expect(answered.state).toBe('answered');
		expect(canPostOnField(noa, { canComment: true, thread: answered }).ok).toBe(true);
		const reopened = post(answered, msg(3));
		expect(reopened.messages).toHaveLength(3);
		expect(reopened.state).toBe('open');
	});

	// e5e11ef5: no message on a thread that became a change.
	it('takes no message once it became a change', () => {
		const changed = turnIntoChange(thread(), { value: 'v2', actorId: 'noa', at: 'now' });
		expect(canPostOnField(noa, { canComment: true, thread: changed }).ok).toBe(false);
	});

	it('refuses a message without the comment right or without an author', () => {
		expect(canPostOnField(noa, { canComment: false, thread: undefined }).ok).toBe(false);
		expect(canPostOnField({ ...noa, id: '' }, { canComment: true, thread: undefined }).ok).toBe(false);
	});

	// abafe9da: a person marks the thread as answered.
	it('lets a person mark a thread with messages as answered', () => {
		const t = thread({ messages: [msg(1), msg(2)] });
		expect(canMarkAnswered(noa, t).ok).toBe(true);
		expect(markAnswered(t).state).toBe('answered');
	});

	// 8ea233ef: the model never rules.
	it('never lets the model mark a thread as answered', () => {
		const t = thread({ messages: [msg(1), msg(2, 'mcp-1')] });
		expect(canMarkAnswered(aiClient, t).ok).toBe(false);
	});

	it('refuses to mark an empty thread, or a thread that became a change, as answered', () => {
		expect(canMarkAnswered(noa, undefined).ok).toBe(false);
		expect(canMarkAnswered(noa, thread({ messages: [] })).ok).toBe(false);
		const changed = turnIntoChange(thread(), { value: 'v2', actorId: 'noa', at: 'now' });
		expect(canMarkAnswered(noa, changed).ok).toBe(false);
	});

	// 411c5b74: a thread ends in a new value.
	it('ends in a new value that names its author', () => {
		const t = thread({ messages: [msg(1), msg(2), msg(3), msg(4)] });
		expect(canTurnIntoChange(noa, { canEdit: true, thread: t }).ok).toBe(true);
		const changed = turnIntoChange(t, {
			value: 'Three key accounts reported in June that migration blocks onboarding.',
			actorId: 'noa',
			at: '2026-09-03T12:00:00Z'
		});
		expect(changed.state).toBe('turned_into_change');
		expect(changed.changedBy).toBe('noa');
		expect(changeIsRecorded(changed)).toBe(true);
		// One change per thread.
		expect(canTurnIntoChange(noa, { canEdit: true, thread: changed }).ok).toBe(false);
	});

	// ab0e6b0f: a viewer cannot turn a thread into a change; nor can the model.
	it('refuses a change from a reader without write access, or from the model', () => {
		expect(canTurnIntoChange(noa, { canEdit: false, thread: thread() }).ok).toBe(false);
		expect(canTurnIntoChange(aiClient, { canEdit: true, thread: thread() }).ok).toBe(false);
	});

	it('counts open threads per block and reads the latest thread of a home', () => {
		const r = createEvolutionRequest({
			fieldThreads: [
				thread({ id: 't1' }),
				markAnswered(thread({ id: 't2', key: '02-problem.value@feat-a' })),
				thread({ id: 't3', key: '05-functional.acceptance@feat-a' })
			]
		});
		expect(openThreadCount(r)).toBe(2);
		expect(openThreadCount(r, '02-problem')).toBe(1);
		expect(openThreadCount(r, '05-functional')).toBe(1);
		expect(latestThread(r, KEY)?.id).toBe('t1');
		expect(latestThread(r, 'nowhere')).toBeUndefined();
	});
});
