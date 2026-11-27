import type { ActiveProjectStorePort } from '$application/ports';
import { pgQuery } from './pg-database.server';

/** The installation's active projects, one `app_settings` document like the other installation settings. */
const ACTIVE_PROJECT_ROW = 'active_project';

const ids = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];

export class PgActiveProjectStore implements ActiveProjectStorePort {
	async load(): Promise<string[]> {
		const { rows } = await pgQuery<{ document: string }>('SELECT document FROM app_settings WHERE id = $1', [
			ACTIVE_PROJECT_ROW
		]);
		if (rows.length === 0) return [];
		try {
			const { projectIds, projectId } = JSON.parse(rows[0].document) as { projectIds?: unknown; projectId?: unknown };
			// A row written before EVO-016 holds the one Community project.
			if (projectIds !== undefined) return ids(projectIds);
			return typeof projectId === 'string' && projectId.length > 0 ? [projectId] : [];
		} catch {
			return [];
		}
	}

	async save(projectIds: readonly string[]): Promise<void> {
		// `projectId` keeps the first one, so an image from before EVO-016 still reads its active project.
		await pgQuery(
			`INSERT INTO app_settings (id, document) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`,
			[ACTIVE_PROJECT_ROW, JSON.stringify({ projectIds, projectId: projectIds[0] ?? null })]
		);
	}
}
