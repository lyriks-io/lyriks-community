import type { ImplementationIndexRevisionsPort } from '$application/ports';
import { getPgPool, pgQuery, ready } from './pg-database.server';

/**
 * The revision of each project's implementation index in PostgreSQL. A write
 * holds the project's row `FOR UPDATE` while it runs, so writes of one project
 * are serialized across every platform node sharing the database, and the
 * check of what was written since a revision cannot race the write itself.
 */
export class PgImplementationIndexRevisions implements ImplementationIndexRevisionsPort {
	async current(projectId: string): Promise<number> {
		const { rows } = await pgQuery<{ revision: number }>(
			'SELECT revision FROM implementation_index_revisions WHERE project_id = $1',
			[projectId]
		);
		return rows[0]?.revision ?? 0;
	}

	async serialize<T>(
		projectId: string,
		units: readonly string[],
		body: Parameters<ImplementationIndexRevisionsPort['serialize']>[2]
	): Promise<{ revision: number; value: T }> {
		await ready();
		const client = await getPgPool().connect();
		try {
			await client.query('BEGIN');
			// `FOR UPDATE` cannot lock an absent row: seed it so two first writes serialize on the key.
			await client.query(
				`INSERT INTO implementation_index_revisions (project_id, revision, updated_at) VALUES ($1, 0, $2)
				 ON CONFLICT (project_id) DO NOTHING`,
				[projectId, new Date().toISOString()]
			);
			const { rows } = await client.query<{ revision: number }>(
				'SELECT revision FROM implementation_index_revisions WHERE project_id = $1 FOR UPDATE',
				[projectId]
			);
			const revision = rows[0]?.revision ?? 0;
			const written = await client.query<{ unit_key: string; revision: number }>(
				'SELECT unit_key, revision FROM implementation_index_unit_writes WHERE project_id = $1 AND unit_key = ANY($2::text[])',
				[projectId, [...units]]
			);
			const lastWritten = new Map(written.rows.map((row) => [row.unit_key, row.revision]));
			const outcome = (await body({ revision, lastWritten })) as { written: readonly string[] | null; value: T };
			if (outcome.written === null) {
				await client.query('COMMIT');
				return { revision, value: outcome.value };
			}
			const next = revision + 1;
			await client.query('UPDATE implementation_index_revisions SET revision = $2, updated_at = $3 WHERE project_id = $1', [
				projectId,
				next,
				new Date().toISOString()
			]);
			const unitKeys = [...new Set(outcome.written)];
			if (unitKeys.length > 0) {
				await client.query(
					`INSERT INTO implementation_index_unit_writes (project_id, unit_key, revision)
					 SELECT $1, unit_key, $3 FROM unnest($2::text[]) AS unit_key
					 ON CONFLICT (project_id, unit_key) DO UPDATE SET revision = EXCLUDED.revision`,
					[projectId, unitKeys, next]
				);
			}
			await client.query('COMMIT');
			return { revision: next, value: outcome.value };
		} catch (e) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw e;
		} finally {
			client.release();
		}
	}
}
