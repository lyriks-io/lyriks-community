import { styledProjectName } from '$domain/foundation';
import type { ProjectCatalogPort } from '../ports';

/**
 * The project catalog as every reader gets it: each project's name in the one
 * style names read in (criterion 69aa0fef), a project named before the rule
 * included, so the menu, Home, search and the MCP never show it otherwise.
 */
export function styledProjectCatalog(catalog: ProjectCatalogPort): ProjectCatalogPort {
	return {
		list: async () => (await catalog.list()).map((p) => ({ ...p, name: styledProjectName(p.name) || p.name })),
		remove: (projectId) => catalog.remove(projectId)
	};
}
