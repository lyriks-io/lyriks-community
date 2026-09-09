import type { ProjectFeaturesDraft } from '$domain/features';

/** Outbound port for persisting Step 04 drafts. Parallel to Steps 01-03. */
export interface FeaturesDraftRepositoryPort {
	load(projectId: string): Promise<ProjectFeaturesDraft | null>;
	save(draft: ProjectFeaturesDraft): Promise<void>;
}
