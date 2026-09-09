import type { ProjectDataDraft } from '$domain/data';

/** Outbound port for persisting Step 07 drafts. Parallel to Steps 01-06. */
export interface DataDraftRepositoryPort {
	load(projectId: string): Promise<ProjectDataDraft | null>;
	save(draft: ProjectDataDraft): Promise<void>;
}
