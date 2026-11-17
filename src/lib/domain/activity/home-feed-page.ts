import { inFeed, type FeedFilter, type FeedItem } from './home-feed';

/**
 * Reading Home's feed one page at a time (feat-home, action c7f50ac5,
 * criterion 8d6c0d92): newest first, each page starting just after the last
 * card of the one before, so a card that comes in meanwhile shifts nothing.
 * The first page is the newest cards whatever the filter; a filter decides
 * what the pages after it bring. Pure.
 */

/** How many cards one reading brings. Provisional: how many screens a page fills is to be measured on real feeds. */
export const HOME_FEED_PAGE = 20;

export interface PagedCard extends FeedItem {
	readonly id: string;
	readonly unread: boolean;
}

type Position = Pick<PagedCard, 'at' | 'id'>;

export interface FeedQuery {
	/** The page starts just after this position; null for the first page. */
	readonly before: string | null;
	readonly filter: FeedFilter;
	/** The projects the page is limited to; none: every project. */
	readonly projects: ReadonlySet<string>;
}

export interface FeedPage<T> {
	readonly cards: readonly T[];
	/** Where the next page starts; null when no card is left. */
	readonly next: string | null;
}

export const FIRST_FEED_QUERY: FeedQuery = { before: null, filter: 'all', projects: new Set() };

const FILTERS: readonly string[] = ['all', 'new', 'decisions', 'drifts'] satisfies FeedFilter[];
const isFeedFilter = (value: string): value is FeedFilter => FILTERS.includes(value);

// The id settles two cards of the same moment, so a page never cuts between them and loses one.
const newestFirst = (a: Position, b: Position): number => b.at.localeCompare(a.at) || b.id.localeCompare(a.id);

const positionText = (card: Position): string => `${card.at}|${card.id}`;

function positionOf(text: string): Position | null {
	const cut = text.indexOf('|');
	if (cut <= 0 || cut === text.length - 1) return null;
	const at = text.slice(0, cut);
	return Number.isNaN(Date.parse(at)) ? null : { at, id: text.slice(cut + 1) };
}

/** One page of the feed, out of all its cards. */
export function feedPage<T extends PagedCard>(cards: readonly T[], query: FeedQuery, size = HOME_FEED_PAGE): FeedPage<T> {
	const after = query.before === null ? null : positionOf(query.before);
	const matching = cards.filter((c) => (!after || newestFirst(after, c) < 0) && inFeed(c, query.filter, query.projects, (card) => card.unread)).sort(newestFirst);
	const page = matching.slice(0, size);
	const last = page.at(-1);
	return { cards: page, next: last && matching.length > size ? positionText(last) : null };
}

/** The cards of the first page as it read before that the first page read now has pushed further back. */
export function pushedOut<T extends Position>(before: readonly T[], now: readonly T[]): T[] {
	const last = now.at(-1);
	if (!last) return [];
	const still = new Set(now.map((c) => c.id));
	return before.filter((c) => !still.has(c.id) && newestFirst(last, c) < 0);
}

/** A query as the address of the request that carries it. */
export function feedQueryParams(query: FeedQuery): URLSearchParams {
	const params = new URLSearchParams({ filter: query.filter });
	if (query.before !== null) params.set('before', query.before);
	for (const id of query.projects) params.append('project', id);
	return params;
}

/** The query an address asks for; null when it cannot be read. */
export function parseFeedQuery(params: URLSearchParams): FeedQuery | null {
	const before = params.get('before');
	if (before !== null && !positionOf(before)) return null;
	const filter = params.get('filter') ?? 'all';
	if (!isFeedFilter(filter)) return null;
	return { before, filter, projects: new Set(params.getAll('project')) };
}
