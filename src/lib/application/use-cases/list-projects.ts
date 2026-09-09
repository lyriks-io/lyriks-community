import type { ProjectSummary } from '$domain/catalog';
import type { ProjectCatalogPort } from '$application/ports';

/** Return every project for the catalog/home, newest first. */
export class ListProjectsUseCase {
	constructor(private readonly catalog: ProjectCatalogPort) {}

	execute(): Promise<ProjectSummary[]> {
		return this.catalog.list();
	}
}
