import type { DraftLockPort } from '$application/ports';
import { getPgPool, pgQuery, ready } from './pg-database.server';

/**
 * Postgres optimistic lock. `commit` runs the compare-and-bump in a transaction
 * with `SELECT … FOR UPDATE`, so it is atomic across all platform nodes sharing
 * the database — this is what makes the lock cluster-wide once on Postgres.
 */
export class PgDraftLock implements DraftLockPort {
	async current(projectId: string, section: string): Promise<number> {
		const { rows } = await pgQuery<{ revision: number }>(
			'SELECT revision FROM draft_revisions WHERE project_id = $1 AND section = $2',
			[projectId, section]
		);
		return rows[0]?.revision ?? 0;
	}

	async rollback(projectId: string, section: string, committed: number): Promise<void> {
		// Compare-and-set back: only undoes OUR bump. If a concurrent writer moved
		// the revision past `committed`, the WHERE clause misses and nothing changes.
		await pgQuery(
			'UPDATE draft_revisions SET revision = $3 WHERE project_id = $1 AND section = $2 AND revision = $4',
			[projectId, section, committed - 1, committed]
		);
	}

	async commit(
		projectId: string,
		section: string,
		expected: number | null
	): Promise<number | null> {
		await ready();
		const client = await getPgPool().connect();
		try {
			await client.query('BEGIN');
			// `FOR UPDATE` cannot lock an absent row. Seed revision 0 first so two
			// concurrent first saves serialize on the unique key.
			await client.query(
				`INSERT INTO draft_revisions (project_id, section, revision) VALUES ($1, $2, 0)
				 ON CONFLICT (project_id, section) DO NOTHING`,
				[projectId, section]
			);
			const { rows } = await client.query<{ revision: number }>(
				'SELECT revision FROM draft_revisions WHERE project_id = $1 AND section = $2 FOR UPDATE',
				[projectId, section]
			);
			const currentRev = rows[0]?.revision ?? 0;
			if (expected !== null && expected !== currentRev) {
				await client.query('ROLLBACK');
				return null; // stale → conflict
			}
			const next = currentRev + 1;
			await client.query(
				'UPDATE draft_revisions SET revision = $3 WHERE project_id = $1 AND section = $2',
				[projectId, section, next]
			);
			await client.query('COMMIT');
			return next;
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}
}
