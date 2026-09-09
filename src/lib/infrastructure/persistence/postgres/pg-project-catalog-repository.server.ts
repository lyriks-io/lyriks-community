import type { ProjectSummary } from '$domain/catalog';
import type { ProjectCatalogPort } from '$application/ports';
import { getPgPool, ready } from './pg-database.server';
import { PROJECT_OWNED_TABLES } from './project-tables';

interface Row {
	project_id: string;
	document: string;
	updated_at: string | null;
}

/**
 * The catalog is derived from the Foundation identity drafts (`project_drafts`).
 * Remove wipes the project across every draft table + its back link, in one
 * transaction.
 */
export class PgProjectCatalogRepository implements ProjectCatalogPort {
	async list(): Promise<ProjectSummary[]> {
		await ready();
		const { rows } = await getPgPool().query<Row>(
			'SELECT project_id, document, updated_at FROM project_drafts ORDER BY updated_at DESC'
		);
		return rows.map((r) => {
			let name = r.project_id;
			let industry = '';
			let description = '';
			try {
				const doc = JSON.parse(r.document) as {
					productName?: string;
					industry?: string;
					brief?: string;
				};
				if (doc.productName && doc.productName.trim()) name = doc.productName.trim();
				industry = doc.industry ?? '';
				description = doc.brief?.trim() ?? '';
			} catch {
				/* tolerate a malformed row — fall back to the id */
			}
			return { id: r.project_id, name, description, industry, lastSavedAt: r.updated_at };
		});
	}

	async remove(projectId: string): Promise<void> {
		await ready();
		const client = await getPgPool().connect();
		try {
			await client.query('BEGIN');
			for (const table of PROJECT_OWNED_TABLES) {
				await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
			}
			await client.query('DELETE FROM back_project_links WHERE local_project_id = $1', [
				projectId
			]);
			await client.query('DELETE FROM project_residue WHERE project_id = $1', [projectId]);
			await client.query('DELETE FROM draft_revisions WHERE project_id = $1', [projectId]);
			await client.query('COMMIT');
		} catch (e) {
			await client.query('ROLLBACK');
			throw e;
		} finally {
			client.release();
		}
	}
}
