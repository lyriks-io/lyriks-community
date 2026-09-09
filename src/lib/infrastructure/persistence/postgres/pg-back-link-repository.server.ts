import type { BackLinkRepositoryPort, BackLinkStatus, BackProjectLink, BackProjectLinkInput } from '$application/ports';
import { pgQuery } from './pg-database.server';

interface Row {
	local_project_id: string;
	back_project_id: string;
	back_workspace_id: string;
	status: BackLinkStatus;
	last_error: string | null;
}

export class PgBackLinkRepository implements BackLinkRepositoryPort {
	async find(localProjectId: string): Promise<BackProjectLink | null> {
		const { rows } = await pgQuery<Row>(
			'SELECT local_project_id, back_project_id, back_workspace_id, status, last_error FROM back_project_links WHERE local_project_id = $1',
			[localProjectId]
		);
		if (rows.length === 0) return null;
		const row = rows[0];
		return {
			localProjectId: row.local_project_id,
			backProjectId: row.back_project_id,
			backWorkspaceId: row.back_workspace_id,
			status: row.status,
			...(row.last_error ? { lastError: row.last_error } : {})
		};
	}

	async save(link: BackProjectLinkInput): Promise<void> {
		// A save means the link was just created or confirmed → `linked`, no error.
		await pgQuery(
			`INSERT INTO back_project_links (local_project_id, back_project_id, back_workspace_id, status, last_error, updated_at)
			 VALUES ($1, $2, $3, 'linked', NULL, $4)
			 ON CONFLICT (local_project_id) DO UPDATE SET
			   back_project_id = EXCLUDED.back_project_id,
			   back_workspace_id = EXCLUDED.back_workspace_id,
			   status = 'linked',
			   last_error = NULL,
			   updated_at = EXCLUDED.updated_at`,
			[link.localProjectId, link.backProjectId, link.backWorkspaceId, new Date().toISOString()]
		);
	}

	async markStatus(localProjectId: string, status: BackLinkStatus, lastError?: string): Promise<void> {
		await pgQuery(
			'UPDATE back_project_links SET status = $2, last_error = $3, updated_at = $4 WHERE local_project_id = $1',
			[localProjectId, status, lastError ?? null, new Date().toISOString()]
		);
	}

	async nextEnvelopeVersion(localProjectId: string): Promise<number | null> {
		// Single-statement increment: concurrent pushes (even across replicas)
		// each get a distinct, strictly increasing version.
		const { rows } = await pgQuery<{ envelope_version: string | number }>(
			'UPDATE back_project_links SET envelope_version = envelope_version + 1 WHERE local_project_id = $1 RETURNING envelope_version',
			[localProjectId]
		);
		if (rows.length === 0) return null;
		return Number(rows[0].envelope_version);
	}
}
