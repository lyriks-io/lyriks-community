/**
 * When something was said, the way a conversation reads it: "just now",
 * "12 min ago", "3 h ago" the same day, "yesterday", then the day ("17 Oct").
 */
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export function relativeWhen(at: string, now: Date = new Date()): string {
	const date = new Date(at);
	if (Number.isNaN(date.getTime())) return '';
	const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	if (date.toDateString() === now.toDateString()) return `${Math.floor(minutes / 60)} h ago`;
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
	return DAY.format(date);
}
