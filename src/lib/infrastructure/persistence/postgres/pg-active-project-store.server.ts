import type { ActiveProjectStorePort } from '$application/ports';
import { pgQuery } from './pg-database.server';

/** The installation's active project, one `app_settings` document like the other installation settings. */
const ACTIVE_PROJECT_ROW = 'active_project';

export class PgActiveProjectStore implements ActiveProjectStorePort {
	async load(): Promise<string | null> {
		const { rows } = await pgQuery<{ document: string }>('SELECT document FROM app_settings WHERE id = $1', [
			ACTIVE_PROJECT_ROW
		]);
		if (rows.length === 0) return null;
		try {
			const { projectId } = JSON.parse(rows[0].document) as { projectId?: unknown };
			return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
		} catch {
			return null;
		}
	}

	async save(projectId: string): Promise<void> {
		await pgQuery(
			`INSERT INTO app_settings (id, document) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`,
			[ACTIVE_PROJECT_ROW, JSON.stringify({ projectId })]
		);
	}
}
