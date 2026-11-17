import { activeProjectAccess, defaultActiveProject, isCommunity, type ScopeCheck } from '$domain/licensing';
import type { ActiveProjectStorePort, ProjectCatalogPort } from '$application/ports';

/** The project a Community installation works on, and how many it holds. */
export interface ActiveProjectState {
	readonly activeProjectId: string | null;
	readonly projectCount: number;
}

/**
 * The installation's active project (EVO-001, Installation.activeProjectId):
 * the one chosen, else the one saved last. Null on every edition but Community,
 * which opens every project and reads nothing for it.
 */
export class ResolveActiveProjectUseCase {
	constructor(
		private readonly edition: () => string | undefined,
		private readonly catalog: Pick<ProjectCatalogPort, 'list'>,
		private readonly store: ActiveProjectStorePort
	) {}

	async execute(): Promise<ActiveProjectState | null> {
		if (!isCommunity(this.edition())) return null;
		const [projects, chosen] = await Promise.all([this.catalog.list(), this.store.load()]);
		// A chosen project since deleted leaves the choice to the default.
		const activeProjectId = chosen && projects.some((p) => p.id === chosen) ? chosen : defaultActiveProject(projects);
		return { activeProjectId, projectCount: projects.length };
	}
}

/** Whether a project may be read or written: on Community, only the active one. */
export function projectScopeAccess(
	edition: string | undefined,
	state: ActiveProjectState | null,
	projectId: string
): ScopeCheck {
	if (!state) return { ok: true };
	return activeProjectAccess(edition, { projectId, ...state });
}

export type MakeProjectActiveResult =
	| { readonly ok: true; readonly activeProjectId: string; readonly previousProjectId: string | null }
	| { readonly ok: false; readonly reason: 'not_community' | 'not_found' };

/** Make a project the active one on Community: the one active before becomes inactive. */
export class MakeProjectActiveUseCase {
	constructor(
		private readonly resolve: Pick<ResolveActiveProjectUseCase, 'execute'>,
		private readonly catalog: Pick<ProjectCatalogPort, 'list'>,
		private readonly store: ActiveProjectStorePort
	) {}

	async execute(projectId: string): Promise<MakeProjectActiveResult> {
		const state = await this.resolve.execute();
		if (!state) return { ok: false, reason: 'not_community' };
		if (!(await this.catalog.list()).some((p) => p.id === projectId)) return { ok: false, reason: 'not_found' };
		await this.store.save(projectId);
		return { ok: true, activeProjectId: projectId, previousProjectId: state.activeProjectId === projectId ? null : state.activeProjectId };
	}
}
