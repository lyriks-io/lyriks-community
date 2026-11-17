import { describe, expect, it } from 'vitest';
import { isUnread, markAllRead, markRead, NO_READS, parseReads } from './reads';

const ev = (id: string, at: string) => ({ id, at });

describe('activity reads', () => {
	it('reads an event unread until it is opened or everything before it is marked read', () => {
		const a = ev('a', '2026-10-20T10:00:00.000Z');
		const b = ev('b', '2026-10-22T10:00:00.000Z');
		expect(isUnread(a, NO_READS)).toBe(true);
		const one = markRead(NO_READS, ['a']);
		expect(isUnread(a, one)).toBe(false);
		expect(isUnread(b, one)).toBe(true);
		const all = markAllRead(one, '2026-10-21T00:00:00.000Z');
		expect(isUnread(a, all)).toBe(false);
		expect(isUnread(b, all)).toBe(true);
		expect(all.readIds).toEqual([]);
	});

	it('reads back a stored document defensively', () => {
		expect(parseReads(null)).toEqual(NO_READS);
		expect(parseReads({ readBefore: 'nope', readIds: ['a', 3] })).toEqual({ readBefore: null, readIds: ['a'] });
	});
});

describe('a run put aside is not a notification read [action:a6a79b22]', () => {
	it('stays hidden through Mark all as read', () => {
		const marked = markRead(NO_READS, ['run:retro:p1:inactive', 'evt-1']);
		expect(markAllRead(marked, '2026-11-08T00:00:00.000Z').readIds).toEqual(['run:retro:p1:inactive']);
	});
});
