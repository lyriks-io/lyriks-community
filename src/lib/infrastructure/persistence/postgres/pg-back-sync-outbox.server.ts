import type { BackSyncOutboxPort, BackSyncPending } from '$application/ports';
import { pgQuery } from './pg-database.server';

/**
 * How long a row claimed by `due` is leased forward before another drain may
 * pick it up again. Long enough for one envelope push, short enough that a
 * crashed replica's claim resurfaces quickly. A double push after a lapse is
 * harmless — the envelope is a latest-wins snapshot.
 */
const CLAIM_LEASE_SECONDS = 60;

/**
 * The `back_sync_outbox` table: one coalescing row per project whose local
 * save has not reached Back yet (see BackSyncOutboxPort for the contract).
 */
export class PgBackSyncOutbox implements BackSyncOutboxPort {
	async enqueue(projectId: string): Promise<void> {
		// Coalesce: keep queued_at (the oldest unmirrored save) but grant the
		// fresh save an immediate attempt with a reset retry ladder.
		await pgQuery(
			`INSERT INTO back_sync_outbox (project_id) VALUES ($1)
			 ON CONFLICT (project_id) DO UPDATE SET attempts = 0, next_attempt_at = now()`,
			[projectId]
		);
	}

	async due(limit: number): Promise<string[]> {
		// Claim-by-lease: pick due rows under FOR UPDATE SKIP LOCKED (concurrent
		// drains on other replicas skip them) and push next_attempt_at forward in
		// the same statement, so the claim outlives this transaction while the
		// push runs. succeeded()/failed() then settle the row.
		const { rows } = await pgQuery<{ project_id: string }>(
			`UPDATE back_sync_outbox
			 SET next_attempt_at = now() + make_interval(secs => $2)
			 WHERE project_id IN (
			 	SELECT project_id FROM back_sync_outbox
			 	WHERE next_attempt_at <= now()
			 	ORDER BY next_attempt_at
			 	LIMIT $1
			 	FOR UPDATE SKIP LOCKED
			 )
			 RETURNING project_id`,
			[limit, CLAIM_LEASE_SECONDS]
		);
		return rows.map((row) => row.project_id);
	}

	async succeeded(projectId: string): Promise<void> {
		await pgQuery('DELETE FROM back_sync_outbox WHERE project_id = $1', [projectId]);
	}

	async failed(projectId: string, error: string): Promise<void> {
		// Exponential backoff — keep the SQL formula in sync with
		// backSyncRetryDelaySeconds (the increment and the schedule must be one
		// atomic statement, so it cannot be computed client-side).
		await pgQuery(
			`UPDATE back_sync_outbox
			 SET attempts = attempts + 1,
			     next_attempt_at = now() + make_interval(secs => LEAST(power(2, attempts + 1) * 5, 900)),
			     last_error = $2
			 WHERE project_id = $1`,
			[projectId, error]
		);
	}

	async pending(): Promise<BackSyncPending> {
		// count(*) arrives as text (bigint) and timestamptz as a JS Date — normalize.
		const { rows } = await pgQuery<{ count: string; oldest: Date | null }>(
			'SELECT count(*) AS count, min(queued_at) AS oldest FROM back_sync_outbox'
		);
		return {
			count: Number.parseInt(rows[0]?.count ?? '0', 10),
			oldestQueuedAt: rows[0]?.oldest?.toISOString() ?? null
		};
	}
}
