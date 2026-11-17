import type { NoticeLevel, NoticeRun, NoticeSection } from './notice';

/**
 * Home's feed (feat-home): the reader's cards in the order of their level, the
 * most urgent first (criterion 85c17859), the words that open each card's text
 * (criterion 45137624), the sentence that sums them up and whose numbers
 * filter them (criterion bae09099), the projects they come from (criterion
 * 9d847801) and since when the oldest unread one came in. Generic
 * over the card, which only has to say its level, its date and its project;
 * whether a card is unread is asked of the caller, who knows the read marks
 * taken a moment ago. Pure.
 */

export interface FeedItem {
	readonly level: NoticeLevel;
	readonly at: string;
	readonly projectId: string;
}

/** The levels in the order the feed shows them, the most urgent first. */
export const FEED_LEVELS: readonly NoticeLevel[] = ['critical', 'drift', 'missing', 'action', 'match', 'certified', 'info'];

/** A card of these levels asks something of the reader: a decision waits until it is read. */
export const asksDecision = (level: NoticeLevel): boolean => level === 'action' || level === 'drift' || level === 'critical' || level === 'missing';
const isDrift = (level: NoticeLevel): boolean => level === 'drift' || level === 'critical';

export type FeedFilter = 'all' | 'new' | 'decisions' | 'drifts';

const urgency = (level: NoticeLevel) => FEED_LEVELS.indexOf(level);

/** The cards in the order of their level, the most urgent first, newest first within a level; no heading between them. */
export function feedInOrder<T extends FeedItem>(cards: readonly T[]): T[] {
	return [...cards].sort((a, b) => urgency(a.level) - urgency(b.level) || b.at.localeCompare(a.at));
}

/** Where a card happened, said after when in the first words of its text. */
export const SECTION_SAID: Readonly<Record<NoticeSection, string>> = {
	'Reverse-Specification': 'during the Reverse-Specification',
	Specification: 'in the specification',
	Discussion: 'in a discussion',
	Evolution: 'on an evolution',
	Implementation: 'during implementation',
	Team: 'in the team',
	'Code watch': 'while watching the code'
};

/** First words that are no name, so they take a small letter once the text no longer starts the sentence. */
const COMMON_OPENERS = new Set(['the', 'a', 'an', 'every', 'each', 'this', 'its', 'it', 'you', "you're", 'there', "there's", 'what', 'some', 'all', 'both', 'two', 'several', 'while', 'no', 'nothing', 'one']);

const firstWord = (text: string) => (text.match(/^[^\s,.:;]+/)?.[0] ?? '').replace(/’/g, "'").toLowerCase();

/** The text already says where it happened: a While clause, or the specification named in its own section. */
function saysWhere(section: string, text: string): boolean {
	return /^While\b/.test(text) || (section === 'Specification' && /^The specification\b/.test(text));
}

/**
 * A card's text opened by when and where it happened (criterion 45137624):
 * "2 hours ago, during the Reverse-Specification, the analysis...". `when` is
 * already said on the reader's clock; a section with no words of its own, or
 * one the text already names, is left out; the text's first word takes a
 * small letter unless it is a name. With no text, the lead is a sentence.
 */
export function feedLead(when: string, section: string, body: readonly NoticeRun[]): NoticeRun[] {
	const first = body[0];
	const said = section in SECTION_SAID && !(first && !first.strong && saysWhere(section, first.text)) ? SECTION_SAID[section as NoticeSection] : '';
	const lead = [when, said].filter(Boolean).join(', ');
	if (!first) return [{ text: `${lead}.` }];
	const lower = !first.strong && COMMON_OPENERS.has(firstWord(first.text));
	const opened = lower ? { ...first, text: first.text.charAt(0).toLowerCase() + first.text.slice(1) } : first;
	return [{ text: `${lead}, ` }, opened, ...body.slice(1)];
}

/** Whether a card shows under the sentence's filter and the projects picked (none picked: every project). */
export function inFeed<T extends FeedItem>(card: T, filter: FeedFilter, picked: ReadonlySet<string>, unread: (card: T) => boolean): boolean {
	if (picked.size > 0 && !picked.has(card.projectId)) return false;
	switch (filter) {
		case 'all':
			return true;
		case 'new':
			return unread(card);
		case 'decisions':
			return unread(card) && asksDecision(card.level);
		case 'drifts':
			return unread(card) && isDrift(card.level);
	}
}

export interface FeedProject {
	readonly projectId: string;
	readonly count: number;
}

/** The projects that have cards, each with its count. */
export function feedProjects<T extends FeedItem>(cards: readonly T[]): FeedProject[] {
	const counts = new Map<string, number>();
	for (const c of cards) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
	return [...counts].map(([projectId, count]) => ({ projectId, count }));
}

/** Since when the oldest unread card came in; null when none is unread. */
export function feedSince<T extends FeedItem>(cards: readonly T[], unread: (card: T) => boolean): string | null {
	return (
		cards
			.filter(unread)
			.map((c) => c.at)
			.sort()[0] ?? null
	);
}

/** A stretch of the sentence: words, a figure in bold, or a figure that filters the feed. */
export type SummaryPart =
	| { readonly kind: 'text'; readonly text: string }
	| { readonly kind: 'bold'; readonly text: string }
	| { readonly kind: 'filter'; readonly text: string; readonly filter: FeedFilter };

const text = (t: string): SummaryPart => ({ kind: 'text', text: t });
const bold = (t: string): SummaryPart => ({ kind: 'bold', text: t });
const filtering = (filter: FeedFilter, t: string): SummaryPart => ({ kind: 'filter', text: t, filter });
const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The sentence over the feed: N new events came in on P projects, D decisions
 * wait for you, R drifts away from the spec with the critical ones, then the
 * actions to take and the missing pieces when there are; a part with nothing
 * to count says so. `projects` is how many projects have cards in the feed.
 */
export function feedSummary<T extends FeedItem>(cards: readonly T[], unread: (card: T) => boolean, projects: number): SummaryPart[] {
	const fresh = cards.filter(unread);
	const decisions = fresh.filter((c) => asksDecision(c.level));
	const drifts = fresh.filter((c) => isDrift(c.level));
	const critical = fresh.filter((c) => c.level === 'critical').length;
	const actions = fresh.filter((c) => c.level === 'action').length;
	const missing = fresh.filter((c) => c.level === 'missing').length;
	if (fresh.length === 0) return [text('Nothing new came in. Nothing waits for your decision, and every project follows its specification.')];
	const parts: SummaryPart[] = [
		filtering('new', count(fresh.length, 'new event', 'new events')),
		text(' came in on '),
		filtering('all', count(projects, 'project', 'projects')),
		text('. ')
	];
	if (decisions.length > 0) parts.push(filtering('decisions', count(decisions.length, 'decision', 'decisions')), text(decisions.length === 1 ? ' waits for you. ' : ' wait for you. '));
	else parts.push(text('Nothing waits for your decision. '));
	if (drifts.length > 0) {
		parts.push(filtering('drifts', count(drifts.length, 'drift', 'drifts')), text(' away from the spec'));
		if (critical > 0) parts.push(text(', '), bold(`${critical} critical`));
		parts.push(text('. '));
	}
	if (actions > 0 || missing > 0) {
		parts.push(text(actions + missing > 1 ? 'There are also ' : 'There is also '));
		if (actions > 0) parts.push(bold(count(actions, 'action', 'actions')), text(' to take'));
		if (actions > 0 && missing > 0) parts.push(text(' and '));
		if (missing > 0) parts.push(bold(count(missing, 'missing piece', 'missing pieces')), text(' of an evolution'));
		parts.push(text('.'));
	}
	return parts;
}
