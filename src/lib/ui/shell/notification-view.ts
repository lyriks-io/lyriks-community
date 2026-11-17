export type { BellKind, BellNotification, BellPerson } from '$lib/shared/app-chrome';
export { timeAgo } from '$lib/shared/time-ago';
import type { NoticeLevel } from '$domain/activity';

/** The word a level reads under (criterion e190404f). */
export const LEVEL_WORD: Readonly<Record<NoticeLevel, string>> = {
	info: 'Info',
	action: 'Action',
	drift: 'Drift',
	critical: 'Critical',
	match: 'Match',
	missing: 'Missing',
	certified: 'Certified'
};

const DAY_MS = 86_400_000;

/** A moment's calendar day in a time zone, as a count of days, so two moments compare by day. */
function dayNumber(d: Date, timeZone: string | undefined): number {
	const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone }).split('-').map(Number);
	return Date.UTC(y, m - 1, day) / DAY_MS;
}

/**
 * When a card of Home's feed happened, in the words that open its text
 * (criterion 45137624 of feat-home): Just now, N minutes ago, N hours ago
 * within a day, then Yesterday at 18:40, On Monday at 18:40 within the week,
 * On 2 November at 18:40 before it. `timeZone` is the reader's own (undefined)
 * once the page is live on their side, UTC for the first paint.
 */
export function whenSaid(at: string, now: number = Date.now(), timeZone?: string): string {
	const d = new Date(at);
	const m = Math.floor((now - d.getTime()) / 60000);
	if (m < 1) return 'Just now';
	if (m < 60) return m === 1 ? 'A minute ago' : `${m} minutes ago`;
	if (m < 1440) {
		const h = Math.floor(m / 60);
		return h === 1 ? 'An hour ago' : `${h} hours ago`;
	}
	const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
	const today = new Date(now);
	const days = dayNumber(today, timeZone) - dayNumber(d, timeZone);
	if (days <= 1) return `Yesterday at ${time}`;
	if (days < 7) return `On ${d.toLocaleDateString('en-GB', { weekday: 'long', timeZone })} at ${time}`;
	const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone });
	const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(year(d) === year(today) ? {} : { year: 'numeric' }), timeZone });
	return `On ${date} at ${time}`;
}

/** How long a toast stays when nothing rests on it: a provisional constant until a measure says otherwise (criterion 31f7e46d). */
export const TOAST_MS = 8000;
/** At most this many toasts show at once, the newest on top. */
export const TOASTS_SHOWN = 3;

/**
 * The notifications that arrived since the list was last read: unread ones the
 * reader had not seen listed. `known` is null on the first reading, when every
 * notification already there is taken as seen and none arrives (criterion
 * 31f7e46d). Returns the arrivals, newest first, and what is known now.
 */
export function arrivals<T extends { readonly id: string; readonly at: string }>(
	known: ReadonlySet<string> | null,
	items: readonly T[],
	unread: (item: T) => boolean
): { readonly arrived: T[]; readonly known: Set<string> } {
	const next = new Set(known ?? []);
	for (const n of items) next.add(n.id);
	if (known === null) return { arrived: [], known: next };
	const arrived = items.filter((n) => !known.has(n.id) && unread(n)).sort((a, b) => b.at.localeCompare(a.at));
	return { arrived, known: next };
}

/** Where a notification happened, as its row splits it: "Taskora · Evolution". */
export function notificationPlace(where: string): { readonly project: string; readonly section: string } {
	const at = where.lastIndexOf(' · ');
	return at < 0 ? { project: where, section: '' } : { project: where.slice(0, at), section: where.slice(at + 3) };
}

export type NotificationDay = 'Today' | 'Yesterday' | 'Earlier';
export const NOTIFICATION_DAYS: readonly NotificationDay[] = ['Today', 'Yesterday', 'Earlier'];

/** The heading a notification reads under, by the reader's calendar day (criterion c12b625e). */
export function notificationDay(at: string, now: number = Date.now(), timeZone?: string): NotificationDay {
	const days = dayNumber(new Date(now), timeZone) - dayNumber(new Date(at), timeZone);
	return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : 'Earlier';
}
