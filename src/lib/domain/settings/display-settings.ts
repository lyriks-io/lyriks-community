/**
 * How the app reads to everyone (Settings → Display): for how many days what
 * just entered the specification reads New (criterion 8c1e9288). App-level and
 * admin-owned, like the other switches.
 */
export interface DisplaySettings {
	/** Whole days a new core feature or feature reads New; 0 turns the badge off. */
	readonly newBadgeDays: number;
}

export const NEW_BADGE_MAX_DAYS = 30;
export const NEW_BADGE_RANGE = `Mark as New for takes 0 to ${NEW_BADGE_MAX_DAYS} days.`;

export function defaultDisplaySettings(): DisplaySettings {
	return { newBadgeDays: 1 };
}

const validDays = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= NEW_BADGE_MAX_DAYS;

/** Coerce a stored document into valid settings: what is out of range falls back to the default. */
export function normalizeDisplaySettings(input: unknown): DisplaySettings {
	const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	return validDays(o.newBadgeDays) ? { newBadgeDays: o.newBadgeDays } : defaultDisplaySettings();
}

/** A change asked by a person: refused with the range when it leaves it (rule a68ceea3). */
export function parseDisplaySettings(input: unknown): { ok: true; settings: DisplaySettings } | { ok: false; refusal: string } {
	const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	return validDays(o.newBadgeDays) ? { ok: true, settings: { newBadgeDays: o.newBadgeDays } } : { ok: false, refusal: NEW_BADGE_RANGE };
}
