import { refuse, type Refused } from './guard';
import { personKey } from './named-validators';
import type { EvolutionRequest, FieldThread, FieldThreadMessage } from './draft';

/**
 * An exchange with one's own AI in a field's thread (ac-evo-live-ask): the
 * question an ask posts and every reply under it stay between the person and
 * their AI until the person makes it a comment, or until the AI's answer
 * changes the specification, which publishes it with that change.
 */

const same = (a: string, b: string) => personKey(a) === personKey(b);

/** Whether a reader may read this message: a private one only by the person it belongs to. */
export const readableBy = (message: Pick<FieldThreadMessage, 'privateTo'>, readerId: string): boolean =>
	!message.privateTo || same(message.privateTo, readerId);

/** The request as one reader sees it: the private exchanges of others are left out, and a thread left empty goes. */
export function requestSeenBy(request: EvolutionRequest, readerId: string): EvolutionRequest {
	if (!request.fieldThreads.some((t) => t.messages.some((m) => !readableBy(m, readerId)))) return request;
	const threads: FieldThread[] = [];
	for (const thread of request.fieldThreads) {
		const messages = thread.messages.filter((m) => readableBy(m, readerId));
		if (messages.length > 0) threads.push(messages.length === thread.messages.length ? thread : { ...thread, messages });
	}
	return { ...request, fieldThreads: threads };
}

/** The message and every message answering it, at any depth, that is private to the same person. */
function exchangeIds(thread: FieldThread, messageId: string, personId: string): Set<string> {
	const ids = new Set<string>([messageId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const m of thread.messages)
			if (!ids.has(m.id) && m.replyTo && ids.has(m.replyTo) && m.privateTo && same(m.privateTo, personId)) {
				ids.add(m.id);
				grew = true;
			}
	}
	return ids;
}

const publicCopy = (m: FieldThreadMessage): FieldThreadMessage => {
	const rest = { ...m };
	delete rest.privateTo;
	return rest;
};

export type PublishOutcome = { readonly ok: true; readonly request: EvolutionRequest; readonly published: number } | Refused;

/**
 * Publish an exchange to everyone who reads the thread ("Make it a comment"):
 * the message named and every private reply under it. Only the person the
 * exchange belongs to publishes it.
 */
export function publishExchange(request: EvolutionRequest, personId: string, messageId: string): PublishOutcome {
	const thread = request.fieldThreads.find((t) => t.messages.some((m) => m.id === messageId));
	const message = thread?.messages.find((m) => m.id === messageId);
	if (!thread || !message?.privateTo || !same(message.privateTo, personId))
		return refuse('Only an exchange between you and your AI is published.', 'Make it a comment only shows on a private exchange of your own.');
	const ids = exchangeIds(thread, messageId, personId);
	return {
		ok: true,
		published: ids.size,
		request: {
			...request,
			fieldThreads: request.fieldThreads.map((t) => (t.id === thread.id ? { ...t, messages: t.messages.map((m) => (ids.has(m.id) ? publicCopy(m) : m)) } : t))
		}
	};
}

/** The message that opened the conversation a message belongs to (ac-evo-fthread-reply). */
export function topicOf(messages: readonly Pick<FieldThreadMessage, 'id' | 'replyTo'>[], messageId: string): string {
	const byId = new Map(messages.map((m) => [m.id, m]));
	let current = byId.get(messageId);
	const seen = new Set<string>();
	while (current?.replyTo && byId.has(current.replyTo) && !seen.has(current.id)) {
		seen.add(current.id);
		current = byId.get(current.replyTo);
	}
	return current?.id ?? messageId;
}

/**
 * Whether the AI takes part in the conversation a message opened: one of its
 * messages is there, or the exchange is private to the person and their AI. A
 * reply there reaches the AI in session; a reply in a conversation between
 * people stays a comment (ac-evo-live-one-box).
 */
export function conversationWithAi(
	messages: readonly (Pick<FieldThreadMessage, 'id' | 'replyTo' | 'privateTo'> & { readonly authorKind: string })[],
	openerId: string
): boolean {
	return messages.some((m) => (m.authorKind === 'ai_client' || !!m.privateTo) && topicOf(messages, m.id) === openerId);
}

/**
 * What the box of a thread sends (ac-evo-live-one-box). A reply in a
 * conversation the AI takes part in has one send, Reply, for replying to the
 * AI is asking it, in a session of the person's own or waiting for the one the
 * copied prompt opens (ac-evo-live-no-session). A reply between people has
 * the same one Reply, which stays among them; a new topic offers Comment and
 * 'Ask your AI', and Enter comments.
 */
export function threadBoxOf(
	messages: readonly (Pick<FieldThreadMessage, 'id' | 'replyTo' | 'privateTo'> & { readonly authorKind: string })[],
	openerId: string | null,
	aiOffered: boolean
): { readonly replyToAi: boolean } {
	return { replyToAi: aiOffered && openerId !== null && conversationWithAi(messages, openerId) };
}

/**
 * The AI's question that still waits for the person in a thread
 * (ac-evo-live-scope): its newest reply marked as waiting, with no message of
 * the person after it in the same conversation. A question in a topic the
 * person resolved waits no more (ac-evo-fthread-resolved-closed).
 */
export function waitingQuestionOf(messages: readonly FieldThreadMessage[], personId: string): FieldThreadMessage | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.authorKind !== 'ai_client' || !m.awaitsAnswer) continue;
		const topic = topicOf(messages, m.id);
		if (messages.find((o) => o.id === topic)?.ruling?.state === 'resolved') continue;
		const answered = messages.some(
			(r) => r.postedAt > m.postedAt && r.authorKind !== 'ai_client' && same(r.author, personId) && topicOf(messages, r.id) === topic
		);
		return answered ? null : m;
	}
	return null;
}
