/**
 * When a cached engine reading must be computed again. The engine's readings
 * (advisories, per-feature scores, implementation coverage) depend on the
 * project's behaviour model, so they are recomputed when that model changed,
 * read from the signature of its kernel folder, and not on a short timer: on a
 * large project a timer kept the single engine process verifying in a loop,
 * and every page that needs the engine queued behind it. A write that moves
 * the model outside the folder still says so through `touch`, which empties
 * `at`. MAX_AGE_MS is the net for what neither sees (an engine upgrade).
 */
export const MAX_AGE_MS = 30 * 60_000;
/** The timer kept where no signature can be read. */
export const UNSIGNED_TTL_MS = 60_000;

export interface SignedEntry {
	/** Epoch ms of the last compute (0 = never). */
	readonly at: number;
	/** The model signature the reading was computed against. */
	readonly signature?: string | null;
}

export function needsRefresh(entry: SignedEntry, current: string | null, now = Date.now()): boolean {
	if (entry.at === 0) return true;
	if (current === null) return now - entry.at > UNSIGNED_TTL_MS;
	return entry.signature !== current || now - entry.at > MAX_AGE_MS;
}

/** The signature, or null when it cannot be read (the timer then decides). */
export function readSignature(signature: ((projectId: string) => string) | undefined, projectId: string): string | null {
	if (!signature) return null;
	try {
		return signature(projectId);
	} catch {
		return null;
	}
}
