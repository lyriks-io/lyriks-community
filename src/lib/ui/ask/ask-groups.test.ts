import { describe, expect, it } from 'vitest';
import { groupConversations } from './ask-groups';

const NOW = new Date(2026, 10, 14, 15, 0);
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).toISOString();
const c = (id: string, updatedAt: string, turn = 'answered') => ({ id, updatedAt, turn });

describe('my conversations are grouped by when they last moved [criterion:2ed3cfa4]', () => {
	it('puts Needs you first, then Today, Yesterday, Previous 7 days and each month, latest first', () => {
		const groups = groupConversations(
			[
				c('ask', at(2026, 10, 2), 'asked_back'),
				c('today', at(2026, 10, 14, 9)),
				c('yesterday', at(2026, 10, 13)),
				c('week', at(2026, 10, 9)),
				c('november', at(2026, 10, 3)),
				c('october', at(2026, 9, 20))
			],
			NOW
		);
		expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
			['Needs you', ['ask']],
			['Today', ['today']],
			['Yesterday', ['yesterday']],
			['Previous 7 days', ['week']],
			['November 2026', ['november']],
			['October 2026', ['october']]
		]);
	});

	it('shows no empty group', () => {
		expect(groupConversations([c('today', at(2026, 10, 14))], NOW).map((g) => g.label)).toEqual(['Today']);
		expect(groupConversations([], NOW)).toEqual([]);
	});
});

describe('an AI that stopped waits under Needs you until read [criterion:31488628]', () => {
	it('puts a conversation that needs the reader first, whatever its turn', () => {
		const now = new Date('2026-11-25T12:00:00.000Z');
		const groups = groupConversations(
			[
				{ id: 'a', updatedAt: '2026-11-25T11:00:00.000Z', turn: 'answered', needsYou: false },
				{ id: 'b', updatedAt: '2026-11-25T10:00:00.000Z', turn: 'answered', needsYou: true }
			],
			now
		);
		expect(groups.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
			['Needs you', ['b']],
			['Today', ['a']]
		]);
	});
});
