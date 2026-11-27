import { describe, expect, it } from 'vitest';
import type { AppServices } from '$composition/container.server';
import { emptyAiConversations, startAiConversation } from '$domain/ai-conversations';
import { needsYouOf } from './ai-conversations.server';

describe('what waits on me reads the pages my AI cites by their names [criterion:7f4690b0]', () => {
	it('gives Ask my AI the words alone, without the link syntax', async () => {
		const told = startAiConversation(
			emptyAiConversations(),
			'ana@x.io',
			{ text: 'Done: approve [EVO-016](/projects/p/evolution?request=r) in Verification.', about: 'stopped', context: null },
			{ conversationId: 'c-1', messageId: 'm-1' },
			'2026-11-26T14:00:00.000Z'
		);
		if (!told.ok) throw new Error('the conversation was refused');
		const services = { aiConversations: { load: async () => told.document } } as unknown as AppServices;
		const waiting = await needsYouOf(services, 'p', 'ana@x.io');
		expect(waiting.latest).toMatchObject({ conversationId: 'c-1', about: 'stopped', text: 'Done: approve EVO-016 in Verification.' });
		expect(told.conversation.title).toBe('Done: approve EVO-016 in Verification.');
	});
});
