import type { AppServices } from '$composition/container.server';
import {
	addAiAnswer,
	chatBusy,
	chatTurn,
	conversationOf,
	conversationsOf,
	decideProposal,
	deleteConversation,
	deliveryOf,
	lyriksNote,
	markPublished,
	markWithdrawn,
	startConversation,
	waitingProposal,
	writeInConversation,
	type AiChatAnswer,
	type AiChatContext,
	type AiChatProposal,
	type AiConversation,
	type ChatTurn,
	type MessageDelivery
} from '$domain/ai-conversations';
import { isAnchor, type DiscussionAuthor } from '$domain/discussions';
import type { ProjectClick } from '$domain/evolution';
import { sendClickOnProject, withdrawClickOnProject } from './ai-session.server';

/**
 * Ask my AI (feat-lyriks-copy-a52881-11, surface cf20b92c): the request layer
 * of a person's private conversations with their own AI. Every function names
 * the person, and every read and write goes through it, so nobody reaches
 * someone else's conversation (criterion 13235e8e). A message to the AI rides
 * the session's clicks (kind chat); the AI answers with answer_click, recorded
 * here once its batch stands.
 */

export type ChatOutcome<T = object> = ({ readonly ok: true } & T) | { readonly ok: false; readonly reason: string; readonly status: number };

const refused = (reason: string, status = 422) => ({ ok: false as const, reason, status });
const SAVE_FAILED = 'Others are writing here right now. Try again.';

/** A conversation as its person reads it, with where its last message stands. */
export interface ConversationView extends AiConversation {
	readonly turn: ChatTurn;
	/** Whether each message of the person reached the AI, by message id (criterion 03172878). */
	readonly delivery: Readonly<Record<string, MessageDelivery>>;
}

async function clicksOf(services: AppServices, projectId: string, personId: string) {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const mine = (draft.clicks ?? []).filter((c) => c.kind === 'chat' && c.personId === personId);
	return (messageId: string) => mine.find((c) => c.messageId === messageId) ?? null;
}

/**
 * The person's own conversations, latest first, each with its turn (action
 * 55fc34ed). A last message to the AI the session holds no click for (lost
 * before the session kept chat clicks whole) is handed to the AI again, so a
 * conversation never waits on nothing.
 */
export async function readMyConversations(services: AppServices, projectId: string, personId: string): Promise<ConversationView[]> {
	const document = await services.aiConversations.load(projectId);
	let clickOf = await clicksOf(services, projectId, personId);
	const mine = conversationsOf(document, personId);
	let resent = false;
	for (const c of mine) {
		const last = c.messages[c.messages.length - 1];
		if (!last || last.role === 'ai' || last.withdrawn || clickOf(last.id)) continue;
		resent = !!(await sendClickOnProject(services, projectId, personId, clickInput(c, last.id, last.text), false))?.ok || resent;
	}
	if (resent) clickOf = await clicksOf(services, projectId, personId);
	return mine.map((c) => ({
		...c,
		turn: chatTurn(c, clickOf),
		delivery: Object.fromEntries(c.messages.filter((m) => m.role === 'person').map((m) => [m.id, deliveryOf(m, clickOf(m.id))]))
	}));
}

function clickInput(conversation: AiConversation, messageId: string, text: string) {
	return {
		kind: 'chat' as const,
		page: 'spec' as const,
		anchor: conversation.context?.anchor ?? '',
		title: conversation.title,
		conversationId: conversation.id,
		messageId,
		text
	};
}

/** A question from the box, or a first message on the page: a new conversation handed to the AI (actions 336e9466, 341647a9). */
export async function startChat(
	services: AppServices,
	projectId: string,
	personId: string,
	input: { readonly text: string; readonly context: AiChatContext | null },
	canEdit: boolean,
	origin: string | null
): Promise<ChatOutcome<{ readonly conversationId: string }>> {
	const ids = { conversationId: crypto.randomUUID(), messageId: crypto.randomUUID() };
	const at = services.clock.nowIso();
	const started = await services.aiConversations.change(projectId, origin, (document) => {
		const outcome = startConversation(document, personId, input, ids, at);
		return { document: outcome.ok ? outcome.document : null, result: outcome };
	});
	if (!started) return refused(SAVE_FAILED, 409);
	if (!started.ok) return refused(started.reason);
	const sent = await sendClickOnProject(services, projectId, personId, clickInput(started.conversation, ids.messageId, started.message.text), canEdit);
	if (!sent?.ok) {
		// Nothing reached the AI: the conversation it would have opened goes too.
		await services.aiConversations.change(projectId, origin, (document) => ({
			document: { ...document, conversations: document.conversations.filter((c) => c.id !== ids.conversationId) },
			result: null
		}));
		return refused(sent && !sent.ok ? sent.reason : SAVE_FAILED, sent ? 422 : 409);
	}
	return { ok: true, conversationId: ids.conversationId };
}

/** The person's next message in their conversation (action f11314df). */
export async function writeChat(
	services: AppServices,
	projectId: string,
	personId: string,
	conversationId: string,
	text: string,
	canEdit: boolean,
	origin: string | null
): Promise<ChatOutcome> {
	const messageId = crypto.randomUUID();
	const at = services.clock.nowIso();
	const clickOf = await clicksOf(services, projectId, personId);
	const written = await services.aiConversations.change(projectId, origin, (document) => {
		const current = conversationOf(document, personId, conversationId);
		const busy = !!current && chatBusy(chatTurn(current, clickOf));
		const outcome = writeInConversation(document, personId, conversationId, text, messageId, at, busy);
		return { document: outcome.ok ? outcome.document : null, result: outcome };
	});
	if (!written) return refused(SAVE_FAILED, 409);
	if (!written.ok) return refused(written.reason, written.notFound ? 404 : 422);
	const sent = await sendClickOnProject(services, projectId, personId, clickInput(written.conversation, messageId, written.message.text), canEdit);
	if (!sent?.ok) return refused(sent && !sent.ok ? sent.reason : SAVE_FAILED, sent ? 422 : 409);
	return { ok: true };
}

/** The person takes back a message their AI has not taken yet (action 2d5ce3ce). */
export async function withdrawChat(services: AppServices, projectId: string, personId: string, conversationId: string, messageId: string, origin: string | null): Promise<ChatOutcome> {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const click = (draft.clicks ?? []).find((c) => c.kind === 'chat' && c.personId === personId && c.conversationId === conversationId && c.messageId === messageId);
	if (!click || click.state !== 'waiting') return refused('Nothing waits for your AI.');
	const withdrawn = await withdrawClickOnProject(services, projectId, personId, click.id);
	if (!withdrawn?.ok) return refused(withdrawn && !withdrawn.ok ? withdrawn.reason : 'Nothing waits for your AI.');
	await services.aiConversations.change(projectId, origin, (document) => {
		const outcome = markWithdrawn(document, personId, conversationId, messageId);
		return { document: outcome.ok ? outcome.document : null, result: null };
	});
	return { ok: true };
}

/**
 * The person deletes one of their conversations (action 98e5712a): refused
 * while the AI reads a message of it (rule 6c6dcbf9); a message still waiting
 * is withdrawn from the AI first, so it never answers into nothing.
 */
export async function deleteChat(services: AppServices, projectId: string, personId: string, conversationId: string, origin: string | null): Promise<ChatOutcome> {
	const draft = await services.loadEvolutionDraft.execute(projectId);
	const pending = (draft.clicks ?? []).filter((c) => c.kind === 'chat' && c.personId === personId && c.conversationId === conversationId);
	if (pending.some((c) => c.state === 'taken')) return refused('Your AI is on it: wait for its answer, then delete.');
	const deleted = await services.aiConversations.change(projectId, origin, (document) => {
		const outcome = deleteConversation(document, personId, conversationId);
		return { document: outcome.ok ? outcome.document : null, result: outcome };
	});
	if (!deleted) return refused(SAVE_FAILED, 409);
	if (!deleted.ok) return refused(deleted.reason, deleted.notFound ? 404 : 422);
	for (const click of pending.filter((c) => c.state === 'waiting')) await withdrawClickOnProject(services, projectId, personId, click.id);
	return { ok: true };
}

/** A message becomes a topic on a block of Knowledge, under the person's name (action deb39290). */
export async function publishChat(
	services: AppServices,
	projectId: string,
	personId: string,
	author: DiscussionAuthor,
	input: { readonly conversationId: string; readonly messageId: string; readonly anchor: string; readonly title: string; readonly text: string },
	origin: string | null
): Promise<ChatOutcome<{ readonly threadId: string }>> {
	if (!input.text.trim()) return refused('Write what you publish first.');
	if (!isAnchor(input.anchor)) return refused('Choose the block it is published on.');
	const document = await services.aiConversations.load(projectId);
	const conversation = conversationOf(document, personId, input.conversationId);
	if (!conversation) return refused('Conversation not found', 404);
	const message = conversation.messages.find((m) => m.id === input.messageId);
	if (!message) return refused('This message is not in the conversation.');
	if (message.published) return refused('Already published.');
	const title = input.title.trim() || input.anchor;
	const posted = await services.actOnDiscussion.execute(projectId, { kind: 'open', anchor: input.anchor, anchorTitle: title, text: input.text.trim(), notify: [] }, author, origin);
	if (!posted.ok) return refused(posted.refusal, posted.conflict ? 409 : 422);
	const threadId = posted.thread.id;
	await services.aiConversations.change(projectId, origin, (current) => {
		const outcome = markPublished(current, personId, input.conversationId, input.messageId, { anchor: input.anchor, title, threadId, at: services.clock.nowIso() });
		return { document: outcome.ok ? outcome.document : null, result: null };
	});
	return { ok: true, threadId };
}

/** What a dry run of the change says against the specification as it is now: empty when it lands cleanly. */
export async function proposalErrors(services: AppServices, projectId: string, proposal: Pick<AiChatProposal, 'featureId' | 'operations'>): Promise<string[]> {
	const answer = await services.authorBehavior
		.execute({ projectId, featureId: proposal.featureId, operations: [...proposal.operations], dryRun: true })
		.catch((e: unknown) => ({ available: false, batch: { ok: false, errors: [e instanceof Error ? e.message : String(e)] } }));
	if (!answer.available) return ['The behaviour engine did not answer: try again in a moment.'];
	return answer.batch?.ok ? [] : [...(answer.batch?.errors ?? ['The dry run refused the change.'])];
}

/** The note Lyriks leaves in the conversation for the AI when a change no longer lands (action 8c59300e). */
export function noLongerLandsNote(proposal: Pick<AiChatProposal, 'summary' | 'featureId'>, errors: readonly string[]): string {
	return [
		`The specification moved since you proposed "${proposal.summary}": the change no longer lands on ${proposal.featureId}.`,
		`What the dry run refused: ${errors.slice(0, 5).join(' | ')}`,
		'Read the feature as it is now and answer with the change corrected, so it lands.'
	].join('\n');
}

/**
 * Validate (action 16be1952) runs the dry run again and writes the change;
 * when the specification moved and it no longer lands, nothing is written and
 * the change goes back to the AI (action 8c59300e). Reject (action f1e5e330)
 * writes nothing. The caller checked that the person may edit (rule 80ef18e5).
 */
export async function decideChatProposal(
	services: AppServices,
	projectId: string,
	personId: string,
	input: { readonly conversationId: string; readonly messageId: string; readonly decision: 'validate' | 'reject' },
	canEdit: boolean,
	origin: string | null
): Promise<ChatOutcome<{ readonly state: AiChatProposal['state']; readonly errors?: readonly string[] }>> {
	const document = await services.aiConversations.load(projectId);
	const conversation = conversationOf(document, personId, input.conversationId);
	if (!conversation) return refused('Conversation not found', 404);
	const proposal = waitingProposal(conversation, input.messageId);
	if (!proposal) return refused('Nothing waits for your validation.');
	const at = services.clock.nowIso();
	const settle = (state: 'applied' | 'rejected' | 'no_longer_lands', errors: readonly string[] = []) =>
		services.aiConversations.change(projectId, origin, (current) => {
			const outcome = decideProposal(current, personId, input.conversationId, input.messageId, state, at, errors);
			return { document: outcome.ok ? outcome.document : null, result: outcome.ok };
		});
	if (input.decision === 'reject') {
		await settle('rejected');
		return { ok: true, state: 'rejected' };
	}
	let errors = await proposalErrors(services, projectId, proposal);
	if (errors.length === 0) {
		const written = await services.authorBehavior.execute({ projectId, featureId: proposal.featureId, operations: [...proposal.operations], dryRun: false });
		errors = written.batch?.ok ? [] : [...(written.batch?.errors ?? ['The engine refused the change.'])];
	}
	if (errors.length === 0) {
		await settle('applied');
		void services.scheduleBackSync(projectId).catch(() => {});
		return { ok: true, state: 'applied' };
	}
	await settle('no_longer_lands', errors);
	const noteId = crypto.randomUUID();
	const text = noLongerLandsNote(proposal, errors);
	const noted = await services.aiConversations.change(projectId, origin, (current) => {
		const outcome = lyriksNote(current, personId, input.conversationId, text, noteId, at);
		return { document: outcome.ok ? outcome.document : null, result: outcome };
	});
	if (noted?.ok) await sendClickOnProject(services, projectId, personId, clickInput(noted.conversation, noteId, text), canEdit);
	return { ok: true, state: 'no_longer_lands', errors };
}

/** The AI's answer reads in the conversation (actions 07f42516, 2bba8f8b, 8459c0e1), once the batch that carried it stands. */
export async function recordChatAnswer(services: AppServices, projectId: string, click: ProjectClick, answer: AiChatAnswer, origin: string | null): Promise<boolean> {
	if (!click.conversationId) return false;
	const at = services.clock.nowIso();
	const saved = await services.aiConversations.change(projectId, origin, (document) => {
		const outcome = addAiAnswer(document, click.personId, click.conversationId!, answer, crypto.randomUUID(), at);
		return { document: outcome.ok ? outcome.document : null, result: outcome.ok };
	});
	return saved === true;
}
