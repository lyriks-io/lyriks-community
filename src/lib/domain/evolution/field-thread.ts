import type { Actor, EvolutionRequest, FieldThread, FieldThreadMessage, TopicRuling } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * One thread per field home, where a sentence is discussed next to the
 * sentence. A thread is never a side channel without consequence: it is in
 * one of three states, open (someone is waiting), answered, or turned into a
 * change (it produced the new value of the field, and names who wrote it).
 *
 * The model replies in a thread; it never rules on it. Marking a thread
 * answered and turning it into a change are a person's acts. A thread is never
 * deleted: closing keeps it readable, and a thread that became a change takes
 * no new message, so the next question opens a new thread on the new value.
 */

/** The latest thread on one field home, if any. */
export function latestThread(request: EvolutionRequest, key: string): FieldThread | undefined {
	const threads = request.fieldThreads.filter((t) => t.key === key);
	return threads[threads.length - 1];
}

/** How many threads are open, optionally under one block (`02-problem` matches `02-problem.*`). */
export function openThreadCount(request: EvolutionRequest, blockId?: string): number {
	return request.fieldThreads.filter(
		(t) => t.state === 'open' && (blockId === undefined || t.key.startsWith(`${blockId}.`))
	).length;
}

/** Posting needs the comment right, and a thread that has not become a change. */
export function canPostOnField(
	actor: Actor,
	input: { canComment: boolean; thread: FieldThread | undefined }
): Guarded {
	return firstRefusal(
		guard(
			actor.id.trim() === '',
			'A message cannot be posted without an author.',
			'Blocks an unattributed message, human or model.'
		),
		guard(
			!input.canComment,
			'You cannot post on this request.',
			'Posting needs the comment right on the request.'
		),
		guard(
			input.thread?.state === 'turned_into_change',
			'This thread already produced a change. Open a new thread on the new value.',
			'A thread that became a change is closed to new messages and stays readable.'
		)
	);
}

/** A ruling is always a person's: the model replies, it never marks a thread answered. */
export function canMarkAnswered(actor: Actor, thread: FieldThread | undefined): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'The model replies in a thread; it never rules on it.',
			'A ruling is always a person\'s.'
		),
		guard(
			!thread || thread.messages.length === 0,
			'Nothing has been said yet.',
			'An empty thread has no answer to acknowledge.'
		),
		guard(
			thread?.state === 'turned_into_change',
			'This thread already produced a change.',
			'A change is a stronger ending than an answer.'
		)
	);
}

/** Ending a thread in a new value is a person's write on the request. */
export function canTurnIntoChange(
	actor: Actor,
	input: { canEdit: boolean; thread: FieldThread | undefined }
): Guarded {
	return firstRefusal(
		guard(
			actor.kind === 'ai_client',
			'The model proposes; a person writes the change.',
			'A change to the spec is a person\'s act.'
		),
		guard(
			!input.canEdit,
			'You can read this request but not write on it.',
			'Writing the new value needs write access.'
		),
		guard(
			input.thread?.state === 'turned_into_change',
			'This thread already produced a change.',
			'One change per thread.'
		)
	);
}

/** Start a thread on a field home with its first message. */
export function openThread(input: {
	id: string;
	key: string;
	message: FieldThreadMessage;
}): FieldThread {
	return {
		id: input.id,
		key: input.key,
		state: 'open',
		messages: [input.message],
		changeValue: null,
		changedBy: null,
		changedAt: null
	};
}

/**
 * The message that opened the conversation a message belongs to: a message of
 * its own opens one, a reply joins the conversation of the message it answers,
 * a reply to a reply included (ac-evo-fthread-reply).
 */
export function topicOpener(thread: FieldThread, messageId: string): FieldThreadMessage | undefined {
	const byId = new Map(thread.messages.map((m) => [m.id, m]));
	let message = byId.get(messageId);
	const seen = new Set<string>();
	while (message?.replyTo && byId.has(message.replyTo) && !seen.has(message.id)) {
		seen.add(message.id);
		message = byId.get(message.replyTo);
	}
	return message;
}

/** The conversations of a thread, by the message that opened each. */
const openers = (thread: FieldThread) => thread.messages.filter((m) => topicOpener(thread, m.id)?.id === m.id);

/** Open while one of its conversations is: someone is waiting; answered once a person settled every one. */
const stateFrom = (thread: FieldThread): FieldThread['state'] =>
	thread.state === 'turned_into_change' ? thread.state : openers(thread).every((m) => m.ruling) ? 'answered' : 'open';

function withoutRuling(message: FieldThreadMessage): FieldThreadMessage {
	const { ruling: _ruling, ...open } = message;
	return open;
}

/**
 * A new message keeps the thread open while someone is waiting: a message of
 * its own opens a conversation, a reply reopens a conversation that was
 * resolved; one already validated stays validated.
 */
export function post(thread: FieldThread, message: FieldThreadMessage): FieldThread {
	const joined = message.replyTo ? topicOpener(thread, message.replyTo)?.id : undefined;
	const messages = thread.messages.map((m) => (m.id === joined && m.ruling?.state === 'resolved' ? withoutRuling(m) : m));
	const next = { ...thread, state: 'open' as const, messages: [...messages, message] };
	return { ...next, state: stateFrom(next) };
}

/**
 * Settle or reopen one conversation of a thread, named by any of its
 * messages. The thread reads answered once every conversation is settled.
 */
export function setTopicRuling(thread: FieldThread, messageId: string, ruling: TopicRuling | null): FieldThread {
	const opener = topicOpener(thread, messageId);
	if (!opener) return thread;
	const messages = thread.messages.map((m) => (m.id !== opener.id ? m : ruling ? { ...m, ruling } : withoutRuling(m)));
	const next = { ...thread, messages };
	return { ...next, state: stateFrom(next) };
}

export function markAnswered(thread: FieldThread): FieldThread {
	return { ...thread, state: 'answered' };
}

/** The thread ended in a value; it names it and the person who wrote it. */
export function turnIntoChange(
	thread: FieldThread,
	input: { value: string; actorId: string; at: string }
): FieldThread {
	return {
		...thread,
		state: 'turned_into_change',
		changeValue: input.value,
		changedBy: input.actorId,
		changedAt: input.at
	};
}

/** A thread that became a change names its value and author. */
export function changeIsRecorded(thread: FieldThread): boolean {
	return (
		thread.state !== 'turned_into_change' ||
		(thread.changeValue !== null && thread.changedBy !== null && thread.changedAt !== null)
	);
}
