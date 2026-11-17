import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedCard, FeedMark, HomeFeedData } from '$lib/shared/home-feed';
import type { NoticeLevel } from '$domain/activity';
import type { FeedPage, FeedQuery } from '$domain/activity';

const reading = vi.hoisted(() => ({ page: vi.fn() }));
const reads = vi.hoisted(() => ({ here: new Set<string>() }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('./home-feed-client', () => ({ readFeedPage: reading.page }));
vi.mock('$ui/shell/notification-reads.svelte', () => ({
	readHere: (id: string) => reads.here.has(id),
	markRead: vi.fn(async () => true)
}));

const { HomeFeed } = await import('./home-feed.svelte');

const card = (id: string, minute: number, level: NoticeLevel = 'info', projectId = 'a'): FeedCard =>
	({ id, at: `2026-11-02T10:${String(minute).padStart(2, '0')}:00.000Z`, level, projectId, unread: true }) as FeedCard;
const mark = (c: FeedCard): FeedMark => ({ id: c.id, level: c.level, at: c.at, projectId: c.projectId });
const ids = (cards: readonly FeedCard[]) => cards.map((c) => c.id);
const page = (cards: readonly FeedCard[], next: string | null = null): FeedPage<FeedCard> => ({ cards, next });

const FIRST = [card('new1', 50, 'info'), card('new2', 40, 'action')];

function open(over: Partial<HomeFeedData> = {}, pickedProject: string | null = null) {
	let data: HomeFeedData = { feed: FIRST, feedNext: 'cursor-1', feedUnread: FIRST.map(mark), feedProjects: [{ projectId: 'a', count: 2 }], ...over };
	const feed = new HomeFeed(() => data, pickedProject);
	return { feed, reload: (next: Partial<HomeFeedData>) => (data = { ...data, ...next }) };
}

beforeEach(() => {
	reading.page.mockReset();
	reads.here.clear();
});

describe('The feed brings its older cards as the reader scrolls [criterion:8d6c0d92]', () => {
	it('sets the older cards below the others, each reading in the order of its levels', async () => {
		reading.page.mockResolvedValueOnce(page([card('old-info', 30), card('old-critical', 20, 'critical')], 'cursor-2'));
		const { feed } = open();
		await feed.loadOlder();
		expect(ids(feed.shown)).toEqual(['new2', 'new1', 'old-critical', 'old-info']);
		expect(feed.next).toBe('cursor-2');
	});

	it('asks from where the last reading stopped', async () => {
		reading.page.mockResolvedValueOnce(page([card('old', 30)], 'cursor-2')).mockResolvedValueOnce(page([card('older', 10)]));
		const { feed } = open();
		await feed.loadOlder();
		await feed.loadOlder();
		expect((reading.page.mock.calls[0][0] as FeedQuery).before).toBe('cursor-1');
		expect((reading.page.mock.calls[1][0] as FeedQuery).before).toBe('cursor-2');
		expect(feed.next).toBeNull();
	});

	it('asks nothing when no card is left [rule:56adc0c7]', async () => {
		const { feed } = open({ feedNext: null });
		await feed.loadOlder();
		expect(reading.page).not.toHaveBeenCalled();
	});

	it('asks once while a reading is on its way [rule:6b23c1dd]', async () => {
		let answer: (p: FeedPage<FeedCard>) => void = () => {};
		reading.page.mockReturnValueOnce(new Promise((done) => (answer = done)));
		const { feed } = open();
		const first = feed.loadOlder();
		expect(feed.loading).toBe(true);
		await feed.loadOlder();
		expect(reading.page).toHaveBeenCalledTimes(1);
		answer(page([]));
		await first;
		expect(feed.loading).toBe(false);
	});

	it('keeps every card after a failure and waits for Try again [rule:beb7e3d6]', async () => {
		reading.page.mockResolvedValueOnce(null);
		const { feed } = open();
		await feed.loadOlder();
		expect(feed.failed).toBe(true);
		expect(ids(feed.shown)).toEqual(['new2', 'new1']);
		await feed.loadOlder('scroll');
		expect(reading.page).toHaveBeenCalledTimes(1);
		reading.page.mockResolvedValueOnce(page([card('old', 30)]));
		await feed.loadOlder('try_again');
		expect(feed.failed).toBe(false);
		expect(ids(feed.shown)).toContain('old');
	});

	it('starts again from the first page when the filter changes, and drops the answer still on its way', async () => {
		reading.page.mockResolvedValueOnce(page([card('old', 30)], 'cursor-2'));
		const { feed } = open();
		await feed.loadOlder();
		let late: (p: FeedPage<FeedCard>) => void = () => {};
		reading.page.mockReturnValueOnce(new Promise((done) => (late = done)));
		const travelling = feed.loadOlder();
		feed.show('new');
		expect(feed.loading).toBe(false);
		expect(feed.next).toBe('cursor-1');
		expect(ids(feed.shown)).toEqual(['new2', 'new1']);
		late(page([card('stale', 5)], 'cursor-3'));
		await travelling;
		expect(ids(feed.shown)).not.toContain('stale');
		expect(feed.next).toBe('cursor-1');
	});

	it('asks the older cards under the filter and the projects in force', async () => {
		reading.page.mockResolvedValueOnce(page([]));
		const { feed } = open();
		feed.choose('decisions');
		feed.toggleProject('p1');
		await feed.loadOlder();
		const asked = reading.page.mock.calls[0][0] as FeedQuery;
		expect(asked.filter).toBe('decisions');
		expect([...asked.projects]).toEqual(['p1']);
	});

	it('keeps a card a new one pushed out of the first page, once older cards are here', async () => {
		reading.page.mockResolvedValueOnce(page([card('old', 30)], 'cursor-2'));
		const { feed, reload } = open();
		await feed.loadOlder();
		const head = [card('fresh', 59), FIRST[0]];
		reload({ feed: head, feedUnread: [...head, FIRST[1]].map(mark) });
		feed.readAgain(head);
		expect(ids(feed.shown)).toEqual(['fresh', 'new1', 'new2', 'old']);
	});

	it('never shows a card twice when one brought by the scroll joins the first page', async () => {
		const old = card('old', 30);
		reading.page.mockResolvedValueOnce(page([old]));
		const { feed, reload } = open();
		await feed.loadOlder();
		const head = [FIRST[0], old];
		reload({ feed: head, feedUnread: head.map(mark) });
		feed.readAgain(head);
		expect(ids(feed.shown).filter((id) => id === 'old')).toHaveLength(1);
	});

	it('tells a card brought by the scroll as read as soon as the feed says so, whoever marked it', async () => {
		const old = card('old', 30);
		reading.page.mockResolvedValueOnce(page([old]));
		const { feed, reload } = open({ feedUnread: [...FIRST, old].map(mark) });
		await feed.loadOlder();
		expect(feed.unread(old)).toBe(true);
		reload({ feedUnread: FIRST.map(mark) });
		expect(feed.unread(old)).toBe(false);
	});
});

describe('Unread or All shows the unread cards or every card, as in the notifications [criterion:27cdc1d7]', () => {
	it('opens on All', () => {
		expect(open().feed.filter).toBe('all');
	});

	it('Unread shows only the cards still unread, and one read leaves at once', () => {
		const { feed } = open();
		feed.show('new');
		expect(ids(feed.shown)).toEqual(['new2', 'new1']);
		reads.here.add('new1');
		expect(ids(feed.shown)).toEqual(['new2']);
	});

	it('All shows the cards already read too', () => {
		const { feed } = open({ feedUnread: [mark(FIRST[0])] });
		feed.show('new');
		expect(ids(feed.shown)).toEqual(['new1']);
		feed.show('all');
		expect(ids(feed.shown)).toEqual(['new2', 'new1']);
	});

	it('never undoes itself and leaves the projects picked, unlike the sentence', () => {
		const { feed } = open({}, 'a');
		feed.show('new');
		feed.show('new');
		expect(feed.filter).toBe('new');
		feed.show('all');
		expect(feed.filter).toBe('all');
		expect([...feed.picked]).toEqual(['a']);
	});

	it('replaces the decisions or the drifts of the sentence', () => {
		const { feed } = open();
		feed.choose('drifts');
		feed.show('new');
		expect(feed.filter).toBe('new');
	});

	it('counts the unread cards of the projects picked in the whole feed, not only those here', () => {
		const others = [card('x', 5, 'info', 'b'), card('y', 4, 'info', 'b'), card('z', 3, 'info', 'a')];
		const { feed } = open({ feedUnread: [...FIRST, ...others].map(mark) });
		expect(feed.unreadCount).toBe(5);
		feed.toggleProject('b');
		expect(feed.unreadCount).toBe(2);
		reads.here.add('x');
		expect(feed.unreadCount).toBe(1);
	});
});
