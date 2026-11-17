/**
 * A thread read as conversations (ac-evo-fthread-reply): each message of its
 * own opens one, and every reply joins the conversation of the message it
 * answers, a reply to a reply included, so replies stand one level deep under
 * the message that opened them, in order of time. A reply whose message the
 * thread does not hold reads as a message of its own rather than disappear.
 */
export interface Conversation<M> {
	readonly opener: M;
	readonly replies: readonly M[];
}

export function conversationsOf<M extends { readonly id: string; readonly replyTo?: string }>(messages: readonly M[]): Conversation<M>[] {
	const conversations: { readonly opener: M; readonly replies: M[] }[] = [];
	const conversationOf = new Map<string, { readonly opener: M; readonly replies: M[] }>();
	for (const message of messages) {
		const joined = message.replyTo ? conversationOf.get(message.replyTo) : undefined;
		const conversation = joined ?? { opener: message, replies: [] };
		if (joined) joined.replies.push(message);
		else conversations.push(conversation);
		conversationOf.set(message.id, conversation);
	}
	return conversations;
}
