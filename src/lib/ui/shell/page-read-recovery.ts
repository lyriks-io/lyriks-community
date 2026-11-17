/** The existing live-update coalescing cadence, shared by read-only recovery. */
export const PAGE_REFRESH_COALESCE_MS = 1000;

/** Retry unavailable reads without overlapping a navigation, another read or replaying a write. */
export function startPageReadRecovery(
	unavailable: () => boolean,
	busy: () => boolean,
	refresh: () => Promise<unknown>
): { retry: () => Promise<void>; stop: () => void } {
	let closed = false;
	let inFlight = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const schedule = () => {
		if (!closed && unavailable() && timer === null) timer = setTimeout(() => { timer = null; void retry(); }, PAGE_REFRESH_COALESCE_MS);
	};
	const retry = async () => {
		if (timer !== null) { clearTimeout(timer); timer = null; }
		if (closed || !unavailable() || inFlight) return;
		if (busy()) { schedule(); return; }
		inFlight = true;
		try { await refresh(); } catch { /* The unavailable state stays visible and another read can recover. */ }
		finally { inFlight = false; schedule(); }
	};
	schedule();
	return { retry, stop: () => { closed = true; if (timer !== null) clearTimeout(timer); timer = null; } };
}
