import { randomBytes } from 'node:crypto';
import type { ActivationRepositoryPort, StoredActivation } from '$application/ports';
import { INSTALL_ID_LENGTH, installIdFromBytes } from '$domain/licensing';
import { pgQuery } from './pg-database.server';

interface Row {
	license_key: string;
	activated_at: string;
}

/** Postgres mirror of the single-row install activation record. */
const ROW_ID = 'default';
// Clock floor in its own single-row table — survives `clear()` so the rollback
// tripwire can't be reset by re-activating.
const FLOOR_ID = 'default';
// Install identity, same single-row shape and same reason to live outside the
// activation row: it outlives every key this box is ever given.
const IDENTITY_ID = 'default';

export class PgActivationRepository implements ActivationRepositoryPort {
	async load(): Promise<StoredActivation | null> {
		const { rows } = await pgQuery<Row>(
			'SELECT license_key, activated_at FROM product_activation WHERE id = $1',
			[ROW_ID]
		);
		const row = rows[0];
		return row ? { key: row.license_key, activatedAt: row.activated_at } : null;
	}

	async save(activation: StoredActivation): Promise<void> {
		// The row demotes itself in the same statement: `product_activation` still
		// holds exactly one row, and the key being replaced moves to the previous
		// columns atomically, so no window exists where neither is recorded.
		// Re-activating the SAME key must not push it into its own previous slot,
		// or a re-paste would silently destroy the real rollback target.
		await pgQuery(
			`INSERT INTO product_activation (id, license_key, activated_at)
			 VALUES ($1, $2, $3)
			 ON CONFLICT(id) DO UPDATE SET
			   previous_key = CASE
			     WHEN product_activation.license_key = excluded.license_key
			       THEN product_activation.previous_key
			     ELSE product_activation.license_key
			   END,
			   previous_activated_at = CASE
			     WHEN product_activation.license_key = excluded.license_key
			       THEN product_activation.previous_activated_at
			     ELSE product_activation.activated_at
			   END,
			   license_key = excluded.license_key,
			   activated_at = excluded.activated_at`,
			[ROW_ID, activation.key, activation.activatedAt]
		);
	}

	async loadPrevious(): Promise<StoredActivation | null> {
		const { rows } = await pgQuery<{ previous_key: string | null; previous_activated_at: string | null }>(
			'SELECT previous_key, previous_activated_at FROM product_activation WHERE id = $1',
			[ROW_ID]
		);
		const row = rows[0];
		if (!row?.previous_key) return null;
		return { key: row.previous_key, activatedAt: row.previous_activated_at ?? '' };
	}

	async clear(): Promise<void> {
		await pgQuery('DELETE FROM product_activation WHERE id = $1', [ROW_ID]);
	}

	async readClockFloor(): Promise<string | null> {
		const { rows } = await pgQuery<{ seen_at: string }>(
			'SELECT seen_at FROM install_clock_floor WHERE id = $1',
			[FLOOR_ID]
		);
		return rows[0]?.seen_at ?? null;
	}

	async advanceClockFloor(nowIso: string): Promise<void> {
		// A garbage timestamp could win the lexicographic GREATEST below — never store one.
		if (Number.isNaN(Date.parse(nowIso))) return;
		// GREATEST() makes the raise atomic and monotonic in the store itself:
		// concurrent advances can commit in any order and the floor never lowers.
		// ISO UTC strings compare lexicographically = chronologically.
		await pgQuery(
			`INSERT INTO install_clock_floor (id, seen_at) VALUES ($1, $2)
			 ON CONFLICT(id) DO UPDATE SET seen_at = GREATEST(install_clock_floor.seen_at, excluded.seen_at)`,
			[FLOOR_ID, nowIso]
		);
	}

	async ensureInstallId(nowIso: string): Promise<string> {
		// Read first: the row exists for the whole life of the install, so the mint
		// below is a once-ever path and every later call stays a plain SELECT rather
		// than a write (an upsert here would rewrite the row on every activation
		// screen an unlicensed appliance serves).
		const existing = await pgQuery<{ install_id: string }>(
			'SELECT install_id FROM install_identity WHERE id = $1',
			[IDENTITY_ID]
		);
		if (existing.rows[0]) return existing.rows[0].install_id;

		// A no-op UPDATE on conflict makes the mint one atomic statement that always
		// RETURNS the winning row: whoever gets there first stores an id, and a
		// concurrent boot reads that one back instead of overwriting it. A plain
		// INSERT ... DO NOTHING returns nothing on conflict and would need a second
		// round trip, which is exactly where two boots could disagree.
		const { rows } = await pgQuery<{ install_id: string }>(
			`INSERT INTO install_identity (id, install_id, created_at) VALUES ($1, $2, $3)
			 ON CONFLICT(id) DO UPDATE SET install_id = install_identity.install_id
			 RETURNING install_id`,
			[IDENTITY_ID, installIdFromBytes(randomBytes(INSTALL_ID_LENGTH)), nowIso]
		);
		return rows[0].install_id;
	}
}
