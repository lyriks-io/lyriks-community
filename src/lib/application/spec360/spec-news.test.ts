import { describe, expect, it } from 'vitest';
import { firstValidatedAt, landedChanges, parseSpecSeen, specNews, unseenNews } from './spec-news';

const live = (id: string, at: string, drafts: { kind: 'add' | 'amend' | 'remove'; baseLeafId: string | null; materialisedAs: string | null }[], status = 'closed') =>
	({ id, status, deployment: { releaseId: null, note: '', declaredBy: 'ana', declaredAt: at }, code: undefined, drafts }) as never;
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-30T09:00:00.000Z');
/** A specification first validated long before what these tests mark. */
const VALIDATED = '2026-10-01T00:00:00.000Z';

describe('what an evolution brought stays marked until it is opened [criterion:b0950115]', () => {
	const requests = [
		live('r1', '2026-10-20T10:00:00.000Z', [
			{ kind: 'add', baseLeafId: null, materialisedAs: 'feat-stats' },
			{ kind: 'amend', baseLeafId: 'feat-shorten', materialisedAs: null },
			{ kind: 'remove', baseLeafId: 'feat-old', materialisedAs: null }
		]),
		live('r2', '2026-10-29T10:00:00.000Z', [{ kind: 'amend', baseLeafId: 'feat-stats', materialisedAs: null }], 'deleted'),
		{ id: 'r3', status: 'open', deployment: null, code: undefined, drafts: [{ kind: 'add', baseLeafId: null, materialisedAs: 'feat-draft' }] } as never
	];

	it('reads what a live evolution added as New and what it changed as Changed, naming it, whatever the setting says', () => {
		const news = specNews({}, landedChanges(requests), NOW, 0, VALIDATED);
		expect(news['feat-stats']).toEqual({ kind: 'new', at: '2026-10-20T10:00:00.000Z', by: 'EVO-001' });
		expect(news['feat-shorten']).toEqual({ kind: 'changed', at: '2026-10-20T10:00:00.000Z', by: 'EVO-001' });
		// Removed, deleted or not live yet: nothing.
		expect(news['feat-old']).toBeUndefined();
		expect(news['feat-draft']).toBeUndefined();
	});

	it('takes the badge off for the reader who opened the feature since, and only for them', () => {
		const news = specNews({}, landedChanges(requests), NOW, 1, VALIDATED);
		expect(unseenNews(news, { 'feat-stats': '2026-10-21T08:00:00.000Z' })['feat-stats']).toBeUndefined();
		expect(unseenNews(news, { 'feat-stats': '2026-10-19T08:00:00.000Z' })['feat-stats']).toBeDefined();
		expect(unseenNews(news, {})['feat-shorten']).toBeDefined();
	});

	it('names the evolution over the first save it caused, and a later change marks it again', () => {
		const first = { 'feat-stats': '2026-10-20T10:00:20.000Z' };
		expect(specNews(first, landedChanges(requests), Date.parse('2026-10-20T12:00:00.000Z'), 1, VALIDATED)['feat-stats'].by).toBe('EVO-001');
		const later = live('r4', '2026-10-29T10:00:00.000Z', [{ kind: 'amend', baseLeafId: 'feat-stats', materialisedAs: null }]);
		const again = specNews({}, landedChanges([...requests, later]), NOW, 1, VALIDATED);
		expect(again['feat-stats']).toMatchObject({ kind: 'changed', at: '2026-10-29T10:00:00.000Z' });
		expect(unseenNews(again, { 'feat-stats': '2026-10-21T08:00:00.000Z' })['feat-stats']).toBeDefined();
	});

	it('reads a stored reader document safely', () => {
		expect(parseSpecSeen({ seen: { a: '2026-10-30T09:00:00.000Z', b: 'yesterday', c: 3 } })).toEqual({ a: '2026-10-30T09:00:00.000Z' });
		expect(parseSpecSeen(null)).toEqual({});
	});
});

describe('what appeared lately reads New, within the setting [criterion:2a6bff42]', () => {
	it('keeps a feature first saved in the window, not one first saved before it', () => {
		const news = specNews({ a: new Date(NOW - DAY / 2).toISOString(), b: new Date(NOW - 3 * DAY).toISOString() }, [], NOW, 1, VALIDATED);
		expect(Object.keys(news)).toEqual(['a']);
		expect(news.a.by).toBeNull();
	});

	it('marks nothing before the specification was first validated, and only what came after it [criterion:2a6bff42]', () => {
		const firstSeen = { reread: new Date(NOW - DAY / 4).toISOString(), later: new Date(NOW - DAY / 8).toISOString(), old: '' };
		// A Reverse-Specification just written and never validated: its starting point, nothing reads New.
		expect(specNews(firstSeen, [], NOW, 1, null)).toEqual({});
		// Validated in between: what was written before stays plain, what came after reads New.
		const validated = new Date(NOW - DAY / 6).toISOString();
		expect(Object.keys(specNews(firstSeen, [], NOW, 1, validated))).toEqual(['later']);
	});

	it('marks no evolution that went live before the first validation [criterion:b0950115]', () => {
		const landed = [{ key: 'EVO-001', at: '2026-10-20T10:00:00.000Z', added: ['feat-a'], changed: ['feat-b'] }];
		expect(specNews({}, landed, NOW, 1, null)).toEqual({});
		expect(specNews({}, landed, NOW, 1, '2026-10-25T00:00:00.000Z')).toEqual({});
		expect(specNews({}, landed, NOW, 1, VALIDATED)['feat-b']).toMatchObject({ kind: 'changed', by: 'EVO-001' });
	});

	it('reads the first validation as the earliest run published', () => {
		expect(firstValidatedAt([{ publishedAt: null }])).toBeNull();
		expect(firstValidatedAt([{ publishedAt: '2026-10-29T10:00:00.000Z' }, { publishedAt: null }, { publishedAt: '2026-10-20T10:00:00.000Z' }])).toBe('2026-10-20T10:00:00.000Z');
	});
});
