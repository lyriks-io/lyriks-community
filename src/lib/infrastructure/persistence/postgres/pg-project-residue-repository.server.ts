import type { ProjectResidueRepositoryPort } from '$application/ports';
import { pgQuery } from './pg-database.server';

/** PostgreSQL document store for the Lyriks-owned residue of every project section. */
export class PgProjectResidueRepository implements ProjectResidueRepositoryPort {
	async load(projectId: string, section: string): Promise<unknown | null> {
		const { rows } = await pgQuery<{ document: string }>(
			'SELECT document FROM project_residue WHERE project_id = $1 AND section = $2',
			[projectId, section]
		);
		return rows.length === 0 ? null : (JSON.parse(rows[0].document) as unknown);
	}

	async save(projectId: string, section: string, payload: unknown): Promise<void> {
		await pgQuery(
			`INSERT INTO project_residue (project_id, section, document, updated_at)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (project_id, section) DO UPDATE SET
			   document = EXCLUDED.document,
			   updated_at = EXCLUDED.updated_at`,
			[projectId, section, JSON.stringify(payload ?? null), new Date().toISOString()]
		);
	}
}
