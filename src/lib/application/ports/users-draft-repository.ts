import type { ProjectUsersDraft } from '$domain/users';

/**
 * Outbound port for persisting Step 03 (Users & Permissions) drafts. Parallel
 * shape to Steps 01 and 02.
 */
export interface UsersDraftRepositoryPort {
	load(projectId: string): Promise<ProjectUsersDraft | null>;
	save(draft: ProjectUsersDraft): Promise<void>;
}
