import type { FeedProject } from '$domain/activity';
import type { BellNotification } from './app-chrome';

/** A card of Home's feed (feat-home): the bell's notification, with the project it belongs to for the feed's filter. */
export interface FeedCard extends BellNotification {
	readonly projectId: string;
}

/** An unread card without its text: what the sentence and the read marks need of a card not brought yet. */
export type FeedMark = Pick<FeedCard, 'id' | 'level' | 'at' | 'projectId'>;

/** What Home's load gives the feed (criterion 8d6c0d92): its first cards, and what is said of the whole of it. */
export interface HomeFeedData {
	/** The first cards of the feed; the older ones are read as the reader scrolls. */
	readonly feed: readonly FeedCard[];
	/** Where the cards after those start; null when there are none. */
	readonly feedNext: string | null;
	/** Every unread card of the whole feed. */
	readonly feedUnread: readonly FeedMark[];
	/** The projects with cards in the whole feed, each with its count. */
	readonly feedProjects: readonly FeedProject[];
}
