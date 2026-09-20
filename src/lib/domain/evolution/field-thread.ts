import type { Actor, EvolutionRequest, FieldThread, FieldThreadMessage } from './draft';
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

/** A new message reopens the thread: someone is waiting again. */
export function post(thread: FieldThread, message: FieldThreadMessage): FieldThread {
	return { ...thread, state: 'open', messages: [...thread.messages, message] };
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
