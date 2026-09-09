/**
 * Durable retry record for the Back envelope mirror
 * (docs/architecture/persistence-sync-remaining.md, item 5).
 *
 * Because the push is a whole-envelope snapshot, the outbox is NOT a queue: one
 * row per project that coalesces (latest-wins). A row means "PostgreSQL is
 * newer than Back for this project"; draining it pushes the CURRENT envelope,
 * so re-enqueueing an already-pending project just refreshes its retry window.
 * In standalone MAP mode (no back configured) nothing enqueues and the table
 * stays empty.
 */

/** Pending mirror gap, surfaced on /readyz when the back mirror is configured. */
export interface BackSyncPending {
	/** Projects whose local save has not reached Back yet. */
	readonly count: number;
	/** ISO instant of the longest-standing gap (null when none pending). */
	readonly oldestQueuedAt: string | null;
}

/**
 * Retry delay after the Nth failed attempt (attempts already incremented):
 * exponential from 10s, capped at 15 min. The PG adapter mirrors this formula
 * in SQL so the increment and the schedule stay one atomic statement — keep
 * the two in sync.
 */
export function backSyncRetryDelaySeconds(attempts: number): number {
	return Math.min(2 ** attempts * 5, 900);
}

export interface BackSyncOutboxPort {
	/**
	 * Record that the project's local state is ahead of Back. Upsert: an existing
	 * row keeps its `queued_at` (the oldest unmirrored save, for surfacing) but
	 * resets `attempts` and `next_attempt_at` to now — a fresh user save deserves
	 * the fast retry ladder again, matching the immediate per-save push the
	 * non-durable mirror always did.
	 */
	enqueue(projectId: string): Promise<void>;
	/**
	 * Claim up to `limit` projects ready for a push (`next_attempt_at` in the
	 * past). Multi-replica safe: rows are picked with `FOR UPDATE SKIP LOCKED`
	 * and leased forward a short window so two drains never work the same row;
	 * a crash mid-push simply lets the lease lapse and the row resurface.
	 */
	due(limit: number): Promise<string[]>;
	/** The push landed — the gap is closed, drop the row. */
	succeeded(projectId: string): Promise<void>;
	/** The push failed — count the attempt, back off, keep the error visible. */
	failed(projectId: string, error: string): Promise<void>;
	/** Pending gap summary for the readiness surface. */
	pending(): Promise<BackSyncPending>;
}
