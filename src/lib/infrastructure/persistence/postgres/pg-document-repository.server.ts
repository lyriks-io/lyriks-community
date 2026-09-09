import { pgQuery } from './pg-database.server';

/**
 * Generic document-store repository: one row per project (`project_id` PK,
 * `document` JSON text, `updated_at`). The only per-type variation is the
 * `fromStored` transform (defaults
 * merge, anti-corruption guards, derived-field resets), passed in by each draft
 * repo. `table` is always a fixed internal constant, never user input.
 */
export class PgDocumentRepository<
	T extends { projectId: string; lastSavedAt?: string | null }
> {
	constructor(
		private readonly table: string,
		private readonly fromStored: (stored: Partial<T>, projectId: string) => T
	) {}

	async load(projectId: string): Promise<T | null> {
		const { rows } = await pgQuery<{ document: string }>(
			`SELECT document FROM ${this.table} WHERE project_id = $1`,
			[projectId]
		);
		if (rows.length === 0) return null;
		return this.fromStored(JSON.parse(rows[0].document) as Partial<T>, projectId);
	}

	async save(draft: T): Promise<void> {
		await pgQuery(
			`INSERT INTO ${this.table} (project_id, document, updated_at) VALUES ($1, $2, $3)
			 ON CONFLICT (project_id) DO UPDATE SET document = EXCLUDED.document, updated_at = EXCLUDED.updated_at`,
			[draft.projectId, JSON.stringify(draft), draft.lastSavedAt ?? new Date().toISOString()]
		);
	}
}
