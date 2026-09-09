import type { ProjectSummary } from '$domain/catalog';

/**
 * Outbound port for the project catalog: enumerate every project and remove one
 * (across all per-step draft tables). Creation goes through the init draft repo
 * — a project exists once its Step 01 draft is saved — so it's not here.
 */
export interface ProjectCatalogPort {
	list(): Promise<ProjectSummary[]>;
	remove(projectId: string): Promise<void>;
}
