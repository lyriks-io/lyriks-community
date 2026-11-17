/**
 * Keeps a read of another service (the team server's roster, a project's
 * people) for a few seconds, so one page that asks for it from its layout,
 * its band and its app bar pays one round trip instead of three or four. The
 * value is per key (project, workspace, reader); a failed read is never kept.
 * A change to a team is seen within TTL at the latest.
 */
const TTL_MS = 30_000;
const MAX_KEYS = 500;

const every: Map<string, unknown>[] = [];

/** Test seam: forget every kept read. */
export function forgetShortMemos(): void {
	for (const kept of every) kept.clear();
}

export function shortMemo<T>(ttlMs = TTL_MS) {
	const kept = new Map<string, { at: number; value: Promise<T> }>();
	every.push(kept);
	return (key: string, read: () => Promise<T>, now = Date.now()): Promise<T> => {
		const hit = kept.get(key);
		if (hit && now - hit.at < ttlMs) return hit.value;
		if (kept.size >= MAX_KEYS) kept.clear();
		const value = read();
		kept.set(key, { at: now, value });
		value.catch(() => {
			if (kept.get(key)?.value === value) kept.delete(key);
		});
		return value;
	};
}
