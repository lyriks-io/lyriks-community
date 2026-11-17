/**
 * When each core feature and feature first entered the specification
 * (criterion 2a6bff42), kept by Lyriks as the features section is saved: a
 * rename or an edit never moves it. What was already there when Lyriks started
 * keeping these moments is marked EARLIER and never reads New.
 */
export type FirstSeen = Readonly<Record<string, string>>;

/** The moment of an element that was there before Lyriks kept moments: never new. */
export const EARLIER = '';

const DAY_MS = 86_400_000;

/**
 * The moments after a save. `prev` is what was kept, `before` the elements
 * the specification held before this save, `ids` the ones it holds after it.
 * A known element keeps its moment; an unknown one is new now, except, the
 * first time moments are kept, the elements that were already there.
 */
export function stampFirstSeen(prev: FirstSeen | undefined, before: ReadonlySet<string>, ids: readonly string[], now: string): FirstSeen {
	const kept: Record<string, string> = {};
	for (const id of ids) kept[id] = prev?.[id] ?? (!prev && before.has(id) ? EARLIER : now);
	return kept;
}

/** Whether an element first entered the specification less than `days` ago (0 days: nothing is new). */
export function isNewSince(firstSeen: FirstSeen | undefined, id: string, now: number, days: number): boolean {
	const at = firstSeen?.[id];
	if (!at || days <= 0) return false;
	const t = Date.parse(at);
	return Number.isFinite(t) && now - t < days * DAY_MS;
}

/** The elements that read New, each with the moment it appeared. */
export function newSince(firstSeen: FirstSeen | undefined, now: number, days: number): Record<string, string> {
	const fresh: Record<string, string> = {};
	for (const [id, at] of Object.entries(firstSeen ?? {})) if (isNewSince(firstSeen, id, now, days)) fresh[id] = at;
	return fresh;
}
