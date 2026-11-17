import { env } from '$env/dynamic/private';

/**
 * A request slower than this is written to the server log with its path and
 * its duration, so a page that takes long on an install can be told apart
 * from the others without a profiler (LYRIKS_SLOW_REQUEST_MS; 0 turns it off).
 */
const DEFAULT_SLOW_MS = 3000;

export function slowRequestThreshold(raw: string | undefined = env.LYRIKS_SLOW_REQUEST_MS): number {
	const value = Number((raw ?? '').trim());
	return (raw ?? '').trim() !== '' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_SLOW_MS;
}

/** The log line for a request, or null when it was quick enough. Never the query string: it may carry a token. */
export function slowRequestLine(method: string, path: string, ms: number, threshold = slowRequestThreshold()): string | null {
	if (threshold <= 0 || ms < threshold) return null;
	return `[slow] ${method} ${path} ${Math.round(ms)}ms`;
}

/** A part of a page's load slower than this is written to the log, so the slow card of a slow page can be named. */
const SLOW_PART_MS = 500;

/**
 * Times one part of a load: `[slow-part] <label> <ms>ms` once it took longer than
 * SLOW_PART_MS (0 in LYRIKS_SLOW_REQUEST_MS turns it off, like the request log).
 * Resolves or rejects exactly as the part does.
 */
export function timedPart<T>(label: string, part: Promise<T>, threshold = slowRequestThreshold()): Promise<T> {
	if (threshold <= 0) return part;
	const started = performance.now();
	const note = () => {
		const ms = performance.now() - started;
		if (ms >= SLOW_PART_MS) console.warn(`[slow-part] ${label} ${Math.round(ms)}ms`);
	};
	return part.then(
		(value) => {
			note();
			return value;
		},
		(error: unknown) => {
			note();
			throw error;
		}
	);
}
