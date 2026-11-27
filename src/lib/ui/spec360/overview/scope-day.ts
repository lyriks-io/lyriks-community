const DAY = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A day of the scope (its decision, its approval) as the Overview reads it: Nov 12, 2026; an unreadable one as written. */
export function scopeDay(iso: string | null): string {
	if (!iso) return '';
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? iso : DAY.format(at);
}

export const capabilitiesCount = (n: number) => `${n} ${n === 1 ? 'capability' : 'capabilities'}`;
