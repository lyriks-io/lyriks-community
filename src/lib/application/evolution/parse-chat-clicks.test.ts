import { describe, expect, it } from 'vitest';
import { parseEvolutionDraft } from './parse-evolution-draft';

/** A message of Ask my AI survives a reading of the draft, or it never reaches the AI (criterion 03172878). */
describe('a chat click is kept whole when the draft is read again [criterion:03172878]', () => {
	const click = (over: Record<string, unknown>) => ({
		id: 'k1',
		personId: 'ana@x.io',
		kind: 'chat',
		page: 'spec',
		anchor: '',
		title: 'Which rules?',
		at: '2026-11-14T01:00:00.000Z',
		state: 'waiting',
		conversationId: 'c1',
		messageId: 'm1',
		text: 'Which rules?',
		...over
	});

	it('keeps a message asked from a page that names no block, with its conversation', () => {
		const draft = parseEvolutionDraft({ requests: [], clicks: [click({})] }, 'p');
		expect(draft.clicks?.[0]).toMatchObject({ kind: 'chat', conversationId: 'c1', messageId: 'm1', anchor: '' });
	});

	it('drops a chat click that names no conversation, and any other click with no place', () => {
		const draft = parseEvolutionDraft({ requests: [], clicks: [click({ conversationId: '' }), click({ id: 'k2', kind: 'reread' })] }, 'p');
		expect(draft.clicks ?? []).toEqual([]);
	});
});
