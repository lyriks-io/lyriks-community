import { goto } from '$app/navigation';
import type { Attachment } from 'svelte/attachments';
import { feedInOrder, inFeed, type FeedFilter } from '$domain/activity';
import { pushedOut } from '$domain/activity';
import { markRead, readHere } from '$ui/shell/notification-reads.svelte';
import type { FeedCard, HomeFeedData } from '$lib/shared/home-feed';
import { readFeedPage } from './home-feed-client';

/** How far ahead of the reader's view the foot of the feed asks for more. Provisional: to be measured on real feeds. */
const FOOT_MARGIN = '800px 0px';

interface OlderCards {
	readonly cards: readonly FeedCard[];
	readonly next: string | null;
}

/**
 * What the reader does on Home's feed (feat-home): the sentence's numbers
 * filter it, a second click undoes it, the projects' number shows everything
 * again (action a2be5c47); Unread or All switches it as in the notifications
 * (action 75cc7f33); All projects limits it to the projects ticked (action
 * 0b9581a7); the older cards come as the reader nears its foot (action
 * c7f50ac5); Got it or Later puts a card aside and opening a card reads it,
 * both with the bell's own read marks, at once and rolled back on a refused
 * save (actions abb7e31e, dc0ec8d2, criterion 7c08bd42).
 */
export class HomeFeed {
	filter = $state<FeedFilter>('all');
	picked = $state<ReadonlySet<string>>(new Set());
	loading = $state(false);
	failed = $state(false);
	/** The cards read past the first page, and where the next ones start; null while only the first page is here. */
	#older = $state<OlderCards | null>(null);
	#reading: AbortController | null = null;
	#head: readonly FeedCard[];
	readonly #data: () => HomeFeedData;
	#unreadIds = $derived.by(() => new Set(this.#data().feedUnread.map((m) => m.id)));

	constructor(data: () => HomeFeedData, pickedProject: string | null = null) {
		this.#data = data;
		this.#head = data().feed;
		if (pickedProject) this.picked = new Set([pickedProject]);
	}

	/** A project picked in the panel of projects (criterion 11c7c8c8): the feed shows it alone. */
	limitTo(projectId: string): void {
		this.picked = new Set([projectId]);
		this.#startOver();
	}

	/** Unread, unless a read mark was taken on it here a moment ago. Asked of the whole feed, so a card brought by the scroll stays true to the marks taken since. */
	readonly unread = (card: Pick<FeedCard, 'id'>): boolean => this.#unreadIds.has(card.id) && !readHere(card.id);

	/** The first page in the order of its levels, then what each reading brought in its own: a card already here never moves. */
	get shown(): FeedCard[] {
		const passes = (c: FeedCard) => inFeed(c, this.filter, this.picked, this.unread);
		const head = this.#data().feed;
		const first = new Set(head.map((c) => c.id));
		return [...feedInOrder(head.filter(passes)), ...(this.#older?.cards ?? []).filter((c) => !first.has(c.id) && passes(c))];
	}

	/** The unread cards of the projects picked, in the whole feed: the N of Unread · N. */
	get unreadCount(): number {
		return this.#data().feedUnread.filter((m) => inFeed(m, 'new', this.picked, this.unread)).length;
	}

	/** Where the next cards start; null when none is left. */
	get next(): string | null {
		return this.#older ? this.#older.next : this.#data().feedNext;
	}

	/** A number of the sentence: its filter, or every card again on a second click; the projects' number clears every filter. */
	choose(filter: FeedFilter): void {
		if (filter === 'all') {
			this.filter = 'all';
			this.picked = new Set();
			this.#startOver();
			return;
		}
		this.filter = this.filter === filter ? 'all' : filter;
		this.#startOver();
	}

	/** The switch above the feed, as in the notifications: it never undoes itself and leaves the projects picked. */
	show(filter: 'new' | 'all'): void {
		if (this.filter === filter) return;
		this.filter = filter;
		this.#startOver();
	}

	toggleProject(projectId: string): void {
		const next = new Set(this.picked);
		if (next.has(projectId)) next.delete(projectId);
		else next.add(projectId);
		this.picked = next;
		this.#startOver();
	}

	clearProjects(): void {
		this.picked = new Set();
		this.#startOver();
	}

	/** Got it or Later: the card reads read where it is. */
	aside(card: FeedCard): void {
		if (this.unread(card)) void markRead([card.id], this.#reads);
	}

	/** The card read, then where it happened. */
	open(card: FeedCard): void {
		if (this.unread(card)) void markRead([card.id], this.#reads);
		void goto(card.href);
	}

	/** The next cards; `try_again` is the reader's own click after a reading that failed. */
	async loadOlder(trigger: 'scroll' | 'try_again' = 'scroll'): Promise<void> {
		const before = this.next;
		if (before === null) return;
		if (this.loading) return;
		if (this.failed && trigger === 'scroll') return;
		const reading = new AbortController();
		this.#reading = reading;
		this.loading = true;
		this.failed = false;
		const page = await readFeedPage({ before, filter: this.filter, projects: this.picked }, reading.signal);
		if (this.#reading !== reading) return; // The reader changed what the feed shows meanwhile.
		this.#reading = null;
		this.loading = false;
		if (!page) {
			this.failed = true;
			return;
		}
		this.#older = { cards: [...(this.#older?.cards ?? []), ...feedInOrder(page.cards)], next: page.next };
	}

	/**
	 * The feed read again while the reader is on it: a card a new one pushed out
	 * of the first page stays in the list, since the pages already brought start
	 * after it. A first reading on its way asked from where the first page ended
	 * before, so it starts over from where it ends now.
	 */
	readAgain(head: readonly FeedCard[]): void {
		const pushed = pushedOut(this.#head, head);
		this.#head = head;
		if (pushed.length === 0) return;
		const older = this.#older;
		if (!older) {
			if (this.loading) this.#startOver();
			return;
		}
		const held = new Set(older.cards.map((c) => c.id));
		this.#older = { ...older, cards: [...feedInOrder(pushed.filter((c) => !held.has(c.id))), ...older.cards] };
	}

	/** On the foot of the feed. Set up again after each reading: an observer only speaks when the foot crosses the line, and a short page leaves it in view. */
	readonly watchFoot: Attachment<HTMLElement> = (node) => {
		if (this.loading) return;
		const observer = new IntersectionObserver(
			([foot]) => {
				if (foot.isIntersecting) void this.loadOlder();
			},
			// Pages scroll in #app-scroll: a margin set on the window would be clipped by it.
			{ root: node.closest('#app-scroll'), rootMargin: FOOT_MARGIN }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};

	readonly #reads = (): unknown => this.#data().feedUnread;

	/** What the feed shows changed: the cards brought for the old view leave, and the list starts again from the first page. */
	#startOver(): void {
		this.#reading?.abort();
		this.#reading = null;
		this.#older = null;
		this.loading = false;
		this.failed = false;
	}
}
