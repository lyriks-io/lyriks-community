import type { ProjectPortabilityStorePort } from '$application/ports';
import type { ProjectRowSnapshot, SectionDocumentRow } from '$domain/portability';
import { getPgPool, pgQuery, ready } from './pg-database.server';
import { LEGACY_DRAFT_TABLES, PROJECT_OWNED_TABLES } from './project-tables';

/**
 * Reads and writes a project's entire PostgreSQL footprint for export/import.
 *
 * Table names come from the shared inventory and are never interpolated from
 * caller input — the only string concatenation in the statements below is over
 * that `as const` list.
 */
export class PgProjectPortabilityStore implements ProjectPortabilityStorePort {
	async read(projectId: string): Promise<ProjectRowSnapshot> {
		await ready();

		const legacyDocuments: Record<string, unknown> = {};
		for (const table of LEGACY_DRAFT_TABLES) {
			const { rows } = await pgQuery<{ document: string }>(
				`SELECT document FROM ${table} WHERE project_id = $1`,
				[projectId]
			);
			if (rows.length > 0) legacyDocuments[table] = parseJson(rows[0].document);
		}

		const sections = await pgQuery<{
			section: string;
			schema_version: number;
			document: unknown;
			revision: number;
		}>(
			`SELECT section, schema_version, document, revision
			 FROM project_section_documents WHERE project_id = $1 ORDER BY section`,
			[projectId]
		);
		const sectionDocuments: Record<string, SectionDocumentRow> = {};
		for (const row of sections.rows) {
			sectionDocuments[row.section] = {
				schemaVersion: Number(row.schema_version),
				document: row.document,
				revision: Number(row.revision)
			};
		}

		const residueRows = await pgQuery<{ section: string; document: string }>(
			'SELECT section, document FROM project_residue WHERE project_id = $1 ORDER BY section',
			[projectId]
		);
		const residue: Record<string, unknown> = {};
		for (const row of residueRows.rows) residue[row.section] = parseJson(row.document);

		const revisionRows = await pgQuery<{ section: string; revision: number }>(
			'SELECT section, revision FROM draft_revisions WHERE project_id = $1 ORDER BY section',
			[projectId]
		);
		const revisions: Record<string, number> = {};
		for (const row of revisionRows.rows) revisions[row.section] = Number(row.revision);

		const metaRows = await pgQuery<{ domain_id: string | null; shipped_at: string | null }>(
			'SELECT domain_id, shipped_at FROM project_meta WHERE project_id = $1',
			[projectId]
		);
		const meta = metaRows.rows[0]
			? { domainId: metaRows.rows[0].domain_id, shippedAt: metaRows.rows[0].shipped_at }
			: null;

		return { legacyDocuments, sectionDocuments, residue, revisions, meta };
	}

	async exists(projectId: string): Promise<boolean> {
		const { rows } = await pgQuery<{ one: number }>(
			'SELECT 1 AS one FROM project_drafts WHERE project_id = $1',
			[projectId]
		);
		return rows.length > 0;
	}

	async write(projectId: string, rows: ProjectRowSnapshot): Promise<void> {
		await ready();
		const now = new Date().toISOString();
		const client = await getPgPool().connect();
		try {
			await client.query('BEGIN');
			// Replace, don't merge: a restore over an existing project must leave no
			// row the bundle does not describe, or the result is a blend of two
			// specifications rather than a copy of one.
			for (const table of PROJECT_OWNED_TABLES) {
				await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
			}
			await client.query('DELETE FROM project_residue WHERE project_id = $1', [projectId]);
			await client.query('DELETE FROM draft_revisions WHERE project_id = $1', [projectId]);

			for (const table of LEGACY_DRAFT_TABLES) {
				const document = rows.legacyDocuments[table];
				if (document === undefined) continue;
				await client.query(
					`INSERT INTO ${table} (project_id, document, updated_at) VALUES ($1, $2, $3)`,
					[projectId, JSON.stringify(document), now]
				);
			}

			for (const [section, row] of Object.entries(rows.sectionDocuments)) {
				await client.query(
					`INSERT INTO project_section_documents
					 (project_id, section, schema_version, document, revision, updated_at)
					 VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
					[projectId, section, row.schemaVersion, JSON.stringify(row.document), row.revision, now]
				);
			}

			for (const [section, document] of Object.entries(rows.residue)) {
				await client.query(
					'INSERT INTO project_residue (project_id, section, document, updated_at) VALUES ($1, $2, $3, $4)',
					[projectId, section, JSON.stringify(document), now]
				);
			}

			for (const [section, revision] of Object.entries(rows.revisions)) {
				await client.query(
					'INSERT INTO draft_revisions (project_id, section, revision) VALUES ($1, $2, $3)',
					[projectId, section, revision]
				);
			}

			if (rows.meta) {
				await client.query(
					'INSERT INTO project_meta (project_id, domain_id, shipped_at, updated_at) VALUES ($1, $2, $3, $4)',
					[projectId, rows.meta.domainId, rows.meta.shippedAt, now]
				);
			}

			await client.query('COMMIT');
		} catch (e) {
			await client.query('ROLLBACK').catch(() => {});
			throw e;
		} finally {
			client.release();
		}
	}
}

/** Legacy documents are TEXT columns holding JSON; tolerate a malformed row. */
function parseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}
