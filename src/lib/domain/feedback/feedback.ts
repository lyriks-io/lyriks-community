/**
 * Feedback bounded context: what a user tells the Lyriks team about the
 * product, and how that message travels. Pure composition rules only; the
 * dialog (UI) picks the channel, and the seller-side relay receives the
 * online submissions. The offline channel needs no server at all: the same
 * report goes out through the user's own mail client, or the clipboard.
 *
 * One visit yields a LIST of items, not one essay: a user rarely has a single
 * thing to say, and a row that mixes a bug with two ideas cannot be triaged.
 * Each item travels as its own entry; the person picks no kind for it, the
 * team sorts the entries as it reads them (criterion 3dc73755).
 */

/** Where the offline (mailto) channel delivers. */
export const FEEDBACK_EMAIL = 'feedback@lyriks.io';

/**
 * The one-click path: a rating alone is a complete, sendable feedback, so the
 * user who has nothing to write still gets counted. Read from left to right
 * in this order (criterion c583b8d4).
 */
export const FEEDBACK_RATINGS = [
	{ id: 'bad', label: 'Bad', icon: 'frown' },
	{ id: 'okay', label: 'Okay', icon: 'meh' },
	{ id: 'good', label: 'Good', icon: 'smile' }
] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number]['id'];

/** Long enough for a real story, short enough to stay a message, not a dump. */
export const MAX_FEEDBACK_MESSAGE = 4000;

/** One visit, at most this many items: a list, never a bulk import. */
export const MAX_FEEDBACK_ITEMS = 20;

/** One thing the user has to say, on its own row so it can be triaged alone. */
export interface FeedbackItem {
	readonly message: string;
}

/**
 * The rows of the notes list once the row at `edited` was written in: the list
 * always closes on one empty row to write the next note in, so nothing is
 * clicked to add one (criterion c583b8d4). Writing in that empty row brings the
 * next one under it, up to `max`; emptying the row just above it takes the
 * extra empty row back. Only the edited row decides, so the row the caret is in
 * is never the one removed. Returns `rows` itself when nothing changes.
 */
export function notesAfterEdit<T extends FeedbackItem>(rows: readonly T[], edited: number, newRow: () => T, max = MAX_FEEDBACK_ITEMS): readonly T[] {
	const blank = (row: T | undefined) => !row || !row.message.trim();
	const last = rows.length - 1;
	if (edited === last && !blank(rows[edited]) && rows.length < max) return [...rows, newRow()];
	if (edited === last - 1 && blank(rows[edited]) && blank(rows[last])) return rows.slice(0, last);
	return rows;
}

export interface FeedbackDraft {
	/** What the user wrote, in order; empty ones are dropped on the way out. */
	readonly items: readonly FeedbackItem[];
	/** How Lyriks is working out overall; '' when the user only wrote items. */
	readonly rating: FeedbackRating | '';
	/** Optional reply-to for the online channel; a mail names its sender anyway. */
	readonly contactEmail: string;
}

/**
 * The items that actually leave: trimmed, blanks dropped (the dialog always
 * shows one empty row to type in), bounded. Every channel sends exactly these,
 * so what the user sees in the report is what the team receives.
 */
export function feedbackItems(draft: FeedbackDraft): FeedbackItem[] {
	return draft.items
		.map((item) => ({ message: item.message.trim() }))
		.filter((item) => item.message.length > 0)
		.slice(0, MAX_FEEDBACK_ITEMS);
}

/** A draft is sendable with at least one written item, a rating, or both. */
export function feedbackSendable(draft: FeedbackDraft): boolean {
	return feedbackItems(draft).length > 0 || draft.rating !== '';
}

/**
 * Facts about this install worth attaching to a report, all display-ready.
 * Attaching them is the user's call (a visible, pre-checked checkbox), which is
 * why they travel as part of the draft's report rather than being added
 * silently by a transport.
 */
export interface FeedbackContext {
	readonly edition: string;
	/** The full Settings → Versions report: version, status, detail and build facts per component. */
	readonly versions: string;
	/** The licence block of the Account panel (client-safe view, never the key). */
	readonly license: string;
	/** The install registration code, tying a report to an install. */
	readonly install: string;
}

function ratingLabel(rating: FeedbackRating): string {
	return FEEDBACK_RATINGS.find((r) => r.id === rating)?.label ?? rating;
}

/** A list says how many items it carries in the heading, and numbers them below. */
function reportHeading(items: readonly FeedbackItem[]): string {
	return items.length > 1 ? `Lyriks feedback · ${items.length} items` : 'Lyriks feedback';
}

/** One item as the team reads it; continuation lines stay under their number. */
function itemBlock(item: FeedbackItem, index: number): string {
	const [first = '', ...rest] = item.message.split('\n');
	return [`${index + 1}. ${first}`, ...rest.map((line) => `   ${line}`)].join('\n');
}

/**
 * The one report every channel carries: plain text on purpose, so it survives
 * a mail client, a clipboard paste and a chat window unchanged.
 */
export function feedbackReport(draft: FeedbackDraft, context: FeedbackContext | null): string {
	const items = feedbackItems(draft);
	const lines = [reportHeading(items)];
	if (draft.rating) lines.push(`Rating: ${ratingLabel(draft.rating)}`);
	if (items.length === 1) lines.push('', items[0].message);
	else if (items.length > 1) lines.push('', ...items.map(itemBlock));
	if (context) {
		lines.push('', '--', `Edition: ${context.edition}`);
		if (context.install) lines.push(`Install: ${context.install}`);
		if (context.license.trim()) lines.push(context.license.trim());
		if (context.versions.trim()) lines.push(context.versions.trim());
	}
	return lines.join('\n');
}

/** First line of the first item (or the count, or the rating), bounded to title a mail. */
export function feedbackSubject(draft: FeedbackDraft): string {
	const items = feedbackItems(draft);
	if (items.length > 1) return `[Lyriks feedback] ${items.length} items`;
	const first = (items[0]?.message.split('\n', 1)[0] ?? '').trim();
	const head =
		first.length > 60
			? `${first.slice(0, 59)}…`
			: first || (draft.rating ? `Rated ${ratingLabel(draft.rating).toLowerCase()}` : '');
	return head ? `[Lyriks feedback] ${head}` : '[Lyriks feedback]';
}

/** The offline channel: a pre-filled mail to the team, nothing transmitted by Lyriks. */
export function feedbackMailto(draft: FeedbackDraft, context: FeedbackContext | null): string {
	const subject = encodeURIComponent(feedbackSubject(draft));
	const body = encodeURIComponent(feedbackReport(draft, context));
	return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}

/* ------------------------------------------------------- proactive invite */

/** Cumulative visible-tab usage before the dialog first invites on its own. */
export const FEEDBACK_INVITE_AFTER_USAGE_MS = 2 * 3_600_000;
/** Minimum gap between two invites: present, never nagging. */
export const FEEDBACK_INVITE_EVERY_MS = 7 * 86_400_000;
/** Quiet period after the user actually sent feedback. */
export const FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS = 30 * 86_400_000;

/** What one browser remembers about the invite cadence (localStorage-backed). */
export interface FeedbackInviteState {
	/** Milliseconds of accumulated visible-tab usage. */
	readonly usageMs: number;
	/** Epoch ms of the last automatic invite, or null before the first. */
	readonly invitedAt: number | null;
	/** Epoch ms of the last feedback the user sent (any channel), or null. */
	readonly sentAt: number | null;
	/** The user said "don't ask again" (dialog footer or Settings). */
	readonly muted: boolean;
}

/**
 * Whether the dialog should invite on its own right now. Pure so the cadence
 * is testable; the host feeds it the stored state and the clock.
 */
export function feedbackInviteDue(state: FeedbackInviteState, nowMs: number): boolean {
	if (state.muted) return false;
	if (state.usageMs < FEEDBACK_INVITE_AFTER_USAGE_MS) return false;
	if (state.sentAt !== null && nowMs - state.sentAt < FEEDBACK_INVITE_SNOOZE_AFTER_SENT_MS) return false;
	if (state.invitedAt !== null && nowMs - state.invitedAt < FEEDBACK_INVITE_EVERY_MS) return false;
	return true;
}
