import { AI_CONVERSATIONS_SECTION, sectionSyncKey } from '$lib/shared/section-sync';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { currentPersonId } from '$lib/server/evolution-actor.server';
import { readMyConversations } from '$lib/server/ai-conversations.server';
import type { PageServerLoad } from './$types';

/**
 * The Ask my AI page (surface cf20b92c): the reader's own conversations with
 * their AI, latest first (action 55fc34ed). Read again when a conversation is
 * written, and when the session's clicks move (the evolution section holds them).
 */
export const load: PageServerLoad = async (event) => {
	const { params, depends, locals } = event;
	depends(
		sectionSyncKey(params.projectId, AI_CONVERSATIONS_SECTION) as `${string}:${string}`,
		sectionSyncKey(params.projectId, 'evolution') as `${string}:${string}`
	);
	await requireProjectAccess(event, params.projectId, 'read');
	const canEdit = await requireProjectAccess(event, params.projectId, 'write').then(
		() => true,
		() => false
	);
	const personId = currentPersonId(locals.services);
	return { conversations: await readMyConversations(locals.services, params.projectId, personId), canEdit };
};
