import type {
	SectionChangeEvent,
	SectionChangePublisher,
	SectionDocumentStorePort
} from '$application/ports';
import { getPgPool, pgQuery, ready } from './pg-database.server';

/** Bump when the stored document shape changes incompatibly for a section. */
const SCHEMA_VERSION = 1;

/**
 * The consolidated `project_section_documents` store. Document + revision live
 * in one row, so `save` is the whole optimistic-lock protocol in ONE
 * transaction: compare the revision under `FOR UPDATE`, write the document,
 * bump the revision and (on the Postgres bus) `pg_notify` the change — a crash
 * can no longer strand the revision ahead of the document or lose the change
 * event, the residual gaps of the old commit/rollback compensation.
 */
export class PgSectionDocumentStore implements SectionDocumentStorePort {
	constructor(private readonly publisher: SectionChangePublisher) {}

	async load(projectId: string, section: string): Promise<unknown | null> {
		const { rows } = await pgQuery<{ document: unknown }>(
			'SELECT document FROM project_section_documents WHERE project_id = $1 AND section = $2',
			[projectId, section]
		);
		return rows.length === 0 ? null : rows[0].document;
	}

	async currentRevision(projectId: string, section: string): Promise<number> {
		const { rows } = await pgQuery<{ revision: number }>(
			'SELECT revision FROM project_section_documents WHERE project_id = $1 AND section = $2',
			[projectId, section]
		);
		return rows[0]?.revision ?? 0;
	}

	async save(
		projectId: string,
		section: string,
		document: unknown,
		expectedRevision: number | null,
		origin: string | null
	): Promise<number | null> {
		await ready();
		const client = await getPgPool().connect();
		try {
			await client.query('BEGIN');
			// Materialize revision 0 before locking. Concurrent first writers now
			// contend on the same unique row; the loser observes revision 1 after the
			// winner commits and correctly returns a conflict.
			await client.query(
				`INSERT INTO project_section_documents
				 (project_id, section, schema_version, document, revision, updated_at)
				 VALUES ($1, $2, $3, '{}'::jsonb, 0, $4)
				 ON CONFLICT (project_id, section) DO NOTHING`,
				[projectId, section, SCHEMA_VERSION, new Date().toISOString()]
			);
			const { rows } = await client.query<{ revision: number }>(
				'SELECT revision FROM project_section_documents WHERE project_id = $1 AND section = $2 FOR UPDATE',
				[projectId, section]
			);
			const current = rows[0]?.revision ?? 0;
			if (expectedRevision !== null && expectedRevision !== current) {
				await client.query('ROLLBACK');
				return null; // stale → conflict
			}
			const next = current + 1;
			await client.query(
				`UPDATE project_section_documents
				 SET document = $4::jsonb, schema_version = $3, revision = $5, updated_at = $6
				 WHERE project_id = $1 AND section = $2`,
				[projectId, section, SCHEMA_VERSION, JSON.stringify(document), next, new Date().toISOString()]
			);
			const change: SectionChangeEvent = { projectId, section, origin };
			await this.publisher.publishInTx((text, values) => client.query(text, values), change);
			await client.query('COMMIT');
			this.publisher.publishAfterCommit(change);
			return next;
		} catch (e) {
			await client.query('ROLLBACK').catch(() => {});
			throw e;
		} finally {
			client.release();
		}
	}
}
