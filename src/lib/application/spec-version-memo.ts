/**
 * Remembers one engine reading per feature, keyed on the version of the spec it
 * was taken from.
 *
 * The background tiers re-read every leaf on every refresh, and a refresh comes
 * with every page open and every TTL tick. For a feature whose kernel file has
 * not changed since the last reading, the engine can only repeat itself, so the
 * repeat is skipped: after one full pass a refresh costs the engine nothing for
 * the leaves nobody touched. The version is the feature's own `updatedAt`, which
 * both the platform and the engine stamp on every write.
 *
 * A reading can still depend on things outside the file (entities referenced
 * across features), so entries also expire on a clock; that bounds how long a
 * cross-feature drift can hide behind an unchanged stamp.
 */
export class SpecVersionMemo<T> {
	readonly #entries = new Map<string, { version: string; at: number; value: T }>();

	constructor(
		private readonly ttlMs = 30 * 60_000,
		private readonly maxEntries = 5_000,
		private readonly now: () => number = Date.now
	) {}

	/** The remembered reading for this exact spec version, or undefined. */
	get(key: string, version: string): T | undefined {
		const entry = this.#entries.get(key);
		if (!entry || entry.version !== version) return undefined;
		if (this.now() - entry.at > this.ttlMs) {
			this.#entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, version: string, value: T): void {
		this.#entries.delete(key);
		this.#entries.set(key, { version, at: this.now(), value });
		// Oldest first: Map keeps insertion order and a hit never re-inserts.
		for (const oldest of this.#entries.keys()) {
			if (this.#entries.size <= this.maxEntries) break;
			this.#entries.delete(oldest);
		}
	}
}

/** The kernel feature's own write stamp, or null when the shell carries none. */
export function specVersionOf(snapshot: { feature?: unknown } | null | undefined): string | null {
	const feature = (snapshot?.feature ?? {}) as Record<string, unknown>;
	return typeof feature.updatedAt === 'string' ? feature.updatedAt : null;
}
