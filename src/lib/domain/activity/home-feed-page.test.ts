import { describe, expect, it } from 'vitest';
import { FIRST_FEED_QUERY, HOME_FEED_PAGE, feedPage, feedQueryParams, parseFeedQuery, pushedOut, type FeedQuery, type PagedCard } from './home-feed-page';
import type { NoticeLevel } from './notice';

const card = (id: string, at: string, over: Partial<PagedCard> = {}): PagedCard => ({ id, at, level: 'info' as NoticeLevel, projectId: 'a', unread: false, ...over });
const stamp = (minute: number) => `2026-11-02T10:${String(minute).padStart(2, '0')}:00.000Z`;
/** Cards from oldest to newest: `n` of them, one a minute. */
const feed = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i}`, stamp(i)));
const ids = (cards: readonly PagedCard[]) => cards.map((c) => c.id);

/** Every card a reader scrolling to the end is brought, page after page. */
function readAll(cards: readonly PagedCard[], query: FeedQuery = FIRST_FEED_QUERY, size?: number): string[] {
	const seen: string[] = [];
	let before = query.before;
	for (;;) {
		const page = feedPage(cards, { ...query, before }, size);
		seen.push(...ids(page.cards));
		if (page.next === null) return seen;
		before = page.next;
	}
}

describe('The feed brings its older cards as the reader scrolls [criterion:8d6c0d92]', () => {
	it('opens on the newest cards and says where the next ones start', () => {
		const page = feedPage(feed(50), FIRST_FEED_QUERY);
		expect(page.cards).toHaveLength(HOME_FEED_PAGE);
		expect(page.cards[0].id).toBe('c49');
		expect(page.cards.at(-1)?.id).toBe('c30');
		expect(page.next).not.toBeNull();
	});

	it('says nothing is left when the last page is read', () => {
		expect(feedPage(feed(3), FIRST_FEED_QUERY).next).toBeNull();
		expect(feedPage(feed(HOME_FEED_PAGE), FIRST_FEED_QUERY).next).toBeNull();
	});

	it('brings every card once, older page after older page', () => {
		const cards = feed(47);
		expect(readAll(cards)).toEqual(ids([...cards].reverse()));
	});

	it('loses no card when a page ends between two cards of the same moment', () => {
		const same = stamp(5);
		const cards = [card('a', same), card('b', same), card('c', same), card('d', same), card('e', same)];
		const seen = readAll(cards, FIRST_FEED_QUERY, 2);
		expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(new Set(seen).size).toBe(5);
	});

	it('is not shifted by a card that comes in meanwhile', () => {
		const cards = feed(30);
		const first = feedPage(cards, FIRST_FEED_QUERY);
		const second = feedPage([card('fresh', stamp(59)), ...cards], { ...FIRST_FEED_QUERY, before: first.next });
		expect(second.cards[0].id).toBe('c9');
		expect(ids(second.cards)).not.toContain('fresh');
		expect(ids(second.cards)).not.toContain(first.cards.at(-1)?.id);
	});

	it('brings the older cards that match, even when none of the first ones do', () => {
		const cards = [...feed(45), card('old-a', stamp(0).replace('10:', '08:'), { unread: true }), card('old-b', stamp(0).replace('10:', '07:'), { unread: true })];
		const first = feedPage(cards, FIRST_FEED_QUERY);
		const page = feedPage(cards, { before: first.next, filter: 'new', projects: new Set() });
		expect(ids(page.cards)).toEqual(['old-a', 'old-b']);
		expect(page.next).toBeNull();
	});

	it('brings only the projects picked', () => {
		const cards = [card('x', stamp(2), { projectId: 'p1' }), card('y', stamp(1), { projectId: 'p2' })];
		expect(ids(feedPage(cards, { ...FIRST_FEED_QUERY, projects: new Set(['p2']) }).cards)).toEqual(['y']);
	});

	it('tells which cards of the first page a new one pushed further back', () => {
		const before = [card('c3', stamp(3)), card('c2', stamp(2)), card('c1', stamp(1))];
		const now = [card('fresh', stamp(9)), card('c3', stamp(3))];
		expect(ids(pushedOut(before, now))).toEqual(['c2', 'c1']);
	});

	it('leaves out a card gone from the feed, which is no older than the first page', () => {
		const before = [card('c3', stamp(3)), card('decided', stamp(2)), card('c1', stamp(1))];
		const now = [card('c3', stamp(3)), card('c1', stamp(1))];
		expect(pushedOut(before, now)).toEqual([]);
	});

	it('reads back from its address exactly what was asked', () => {
		const first = feedPage(feed(30), FIRST_FEED_QUERY);
		const asked: FeedQuery = { before: first.next, filter: 'decisions', projects: new Set(['p1', 'p2']) };
		expect(parseFeedQuery(feedQueryParams(asked))).toEqual(asked);
	});

	it('refuses an address it cannot read', () => {
		expect(parseFeedQuery(new URLSearchParams('filter=everything'))).toBeNull();
		expect(parseFeedQuery(new URLSearchParams('before=not-a-position'))).toBeNull();
		expect(parseFeedQuery(new URLSearchParams('before=yesterday|c1'))).toBeNull();
		expect(parseFeedQuery(new URLSearchParams(''))).toEqual(FIRST_FEED_QUERY);
	});
});
