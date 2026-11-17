import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { resolveEvolutionActor } from '$lib/server/evolution-actor.server';
import { discussionAuthor } from '$lib/server/spec360-discussions.server';
import { decideChatProposal, deleteChat, publishChat, readMyConversations, startChat, withdrawChat, writeChat, type ChatOutcome } from '$lib/server/ai-conversations.server';
import { isAnchor } from '$domain/discussions';
import type { AiChatContext } from '$domain/ai-conversations';
import type { RequestHandler } from './$types';

/**
 * Ask my AI, the person's private conversations with their AI (surface cf20b92c).
 *
 *   GET → { conversations } (the caller's own, latest first)
 *   POST { act: start, text, context? }              → { conversationId }
 *        { act: write, conversationId, text }
 *        { act: withdraw, conversationId, messageId }
 *        { act: publish, conversationId, messageId, anchor, title, text } → { threadId }
 *        { act: validate | reject, conversationId, messageId }           → { state, errors? }
 *        { act: delete, conversationId }
 *
 * Reading the project is enough to talk with one's AI; validating a change
 * needs the right to edit it. Who writes is resolved from the session, never
 * read from the body, and an AI client never writes in the person's place.
 */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function contextOf(v: unknown): AiChatContext | null {
	if (!v || typeof v !== 'object') return null;
	const r = v as Record<string, unknown>;
	const href = str(r.href);
	// Only a page of this application: never an address elsewhere.
	if (!href.startsWith('/') || href.startsWith('//')) return null;
	return { ...(isAnchor(r.anchor) ? { anchor: r.anchor } : {}), title: str(r.title).slice(0, 200), href: href.slice(0, 500) };
}

const answer = (outcome: ChatOutcome<object>) => (outcome.ok ? json(outcome) : json({ ok: false, reason: outcome.reason }, { status: outcome.status }));

export const GET: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const actor = await resolveEvolutionActor(event.locals.services, event, projectId);
	return json({ conversations: await readMyConversations(event.locals.services, projectId, actor.id) });
};

export const POST: RequestHandler = async (event) => {
	const { projectId } = event.params;
	await requireProjectAccess(event, projectId, 'read');
	const services = event.locals.services;
	const actor = await resolveEvolutionActor(services, event, projectId);
	if (actor.kind !== 'person') error(403, 'Only the person writes in their conversations.');
	const canEdit = await requireProjectAccess(event, projectId, 'write').then(
		() => true,
		() => false
	);
	const body = ((await event.request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const origin = event.request.headers.get('x-lyriks-client');
	const conversationId = str(body.conversationId);
	const messageId = str(body.messageId);
	switch (body.act) {
		case 'start':
			return answer(await startChat(services, projectId, actor.id, { text: str(body.text), context: contextOf(body.context) }, canEdit, origin));
		case 'write':
			return answer(await writeChat(services, projectId, actor.id, conversationId, str(body.text), canEdit, origin));
		case 'withdraw':
			return answer(await withdrawChat(services, projectId, actor.id, conversationId, messageId, origin));
		case 'publish': {
			const author = await discussionAuthor(services, projectId, event.cookies);
			return answer(
				await publishChat(services, projectId, actor.id, author, { conversationId, messageId, anchor: str(body.anchor), title: str(body.title), text: str(body.text) }, origin)
			);
		}
		case 'delete':
			return answer(await deleteChat(services, projectId, actor.id, conversationId, origin));
		case 'validate':
			if (!canEdit) return json({ ok: false, reason: 'Only who may edit the project validates a change.' }, { status: 403 });
			return answer(await decideChatProposal(services, projectId, actor.id, { conversationId, messageId, decision: 'validate' }, canEdit, origin));
		case 'reject':
			return answer(await decideChatProposal(services, projectId, actor.id, { conversationId, messageId, decision: 'reject' }, canEdit, origin));
		default:
			error(400, 'act must be start, write, withdraw, publish, validate, reject or delete');
	}
};
