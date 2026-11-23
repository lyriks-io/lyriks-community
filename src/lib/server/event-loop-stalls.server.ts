import { env } from '$env/dynamic/private';

/**
 * The server answers every request on one thread: a computation that holds it
 * holds every page, the cheap ones included. This watcher wakes every TICK_MS
 * and, when it woke later than the threshold, writes
 * `[stall] <ms>ms during <requests>`: the requests in flight and those that
 * ended inside the stall, so the one that held the thread can be named
 * without a profiler (LYRIKS_STALL_MS; 0 turns it off).
 */
const TICK_MS = 100;
/** Provisional: a stall users feel; to be set once from what lab logs. */
const DEFAULT_STALL_MS = 200;
/** How many recently ended requests are kept to name a stall that outlived them. */
const RECENT_MAX = 20;

export function stallThreshold(raw: string | undefined = env.LYRIKS_STALL_MS): number {
	const value = Number((raw ?? '').trim());
	return (raw ?? '').trim() !== '' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_STALL_MS;
}

/** The log line for a late wake-up, or null when it was on time. */
export function stallLine(lateMs: number, threshold: number, during: readonly string[]): string | null {
	if (threshold <= 0 || lateMs < threshold) return null;
	const names = [...new Set(during)];
	return `[stall] ${Math.round(lateMs)}ms during ${names.length > 0 ? names.join(', ') : 'no request (background work)'}`;
}

const inFlight = new Map<number, string>();
const recent: { label: string; endedAt: number }[] = [];
let nextId = 0;
let watching = false;

/** Marks a request as running until the returned function is called. */
export function trackRequest(label: string): () => void {
	const id = ++nextId;
	inFlight.set(id, label);
	return () => {
		inFlight.delete(id);
		recent.push({ label, endedAt: performance.now() });
		if (recent.length > RECENT_MAX) recent.shift();
	};
}

/** Starts the watcher once per process; the timer never keeps the process alive. */
export function startStallWatch(threshold = stallThreshold()): void {
	if (watching || threshold <= 0) return;
	watching = true;
	let expected = performance.now() + TICK_MS;
	const timer = setInterval(() => {
		const now = performance.now();
		const late = now - expected;
		expected = now + TICK_MS;
		if (late < threshold) return;
		const stallStart = now - late - TICK_MS;
		const during = [...inFlight.values(), ...recent.filter((r) => r.endedAt >= stallStart).map((r) => r.label)];
		const line = stallLine(late, threshold, during);
		if (line) console.warn(line);
	}, TICK_MS);
	timer.unref?.();
}
