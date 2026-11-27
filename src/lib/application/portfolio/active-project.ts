import { activeProjectAccess, isCommunity, resolveActiveProjects, type ScopeCheck } from '$domain/licensing';
import type { ActiveProjectStorePort, ProjectCatalogPort } from '$application/ports';

/** The projects an installation works on, how many it holds, and how many its key grants. */
export interface ActiveProjectState {
	/** The active projects, most recently made active first. */
	readonly activeProjectIds: readonly string[];
	readonly projectCount: number;
	/** The number of active projects the key grants (1 on Community). */
	readonly granted: number;
}

/**
 * The installation's active projects (EVO-001, Installation.activeProjectId;
 * EVO-016, N of them): the ones chosen, completed by the ones saved last. Null
 * where the key grants every project (an Enterprise key that states no number),
 * which reads nothing for it.
 */
export class ResolveActiveProjectUseCase {
	constructor(
		private readonly projectsGranted: () => number | null,
		private readonly catalog: Pick<ProjectCatalogPort, 'list'>,
		private readonly store: ActiveProjectStorePort
	) {}

	async execute(): Promise<ActiveProjectState | null> {
		const granted = this.projectsGranted();
		if (granted === null) return null;
		const [projects, chosen] = await Promise.all([this.catalog.list(), this.store.load()]);
		// A chosen project since deleted leaves its place to the ones saved last.
		return { activeProjectIds: resolveActiveProjects(projects, chosen, granted), projectCount: projects.length, granted };
	}
}

/** Whether a project may be read or written: only an active one, where the key grants fewer than the installation holds. */
export function projectScopeAccess(
	edition: string | undefined,
	state: ActiveProjectState | null,
	projectId: string
): ScopeCheck {
	if (!state) return { ok: true };
	return activeProjectAccess(edition, { projectId, ...state });
}

/**
 * The projects the project list marks active: Community marks its active one,
 * as it always has; an Enterprise key marks its N only once the installation
 * holds more than N, when some wait inactive (EVO-016, criterion e00f8726).
 */
export function activeProjectMarks(edition: string | undefined, state: ActiveProjectState | null): readonly string[] | null {
	if (!state) return null;
	return isCommunity(edition) || state.projectCount > state.granted ? state.activeProjectIds : null;
}

export type MakeProjectActiveResult =
	| {
			readonly ok: true;
			readonly activeProjectIds: readonly string[];
			/** The project set aside to make room, null when none was. */
			readonly previousProjectId: string | null;
	  }
	| { readonly ok: false; readonly reason: 'unlimited' | 'not_found' }
	/** Every place is taken and more than one project is active: the person picks the one to set aside. */
	| {
			readonly ok: false;
			readonly reason: 'choose_set_aside';
			/** The active projects to pick from, by name, most recently made active first. */
			readonly activeProjects: readonly { readonly id: string; readonly name: string }[];
	  };

/**
 * Make a project active (EVO-016, criterion 601e615e): it takes a free place;
 * with every place taken, the one active project is set aside without asking,
 * and with several the person names the one to set aside.
 */
export class MakeProjectActiveUseCase {
	constructor(
		private readonly resolve: Pick<ResolveActiveProjectUseCase, 'execute'>,
		private readonly catalog: Pick<ProjectCatalogPort, 'list'>,
		private readonly store: ActiveProjectStorePort
	) {}

	async execute(projectId: string, setAsideProjectId?: string): Promise<MakeProjectActiveResult> {
		const state = await this.resolve.execute();
		if (!state) return { ok: false, reason: 'unlimited' };
		const projects = await this.catalog.list();
		if (!projects.some((p) => p.id === projectId)) return { ok: false, reason: 'not_found' };
		const active = state.activeProjectIds;
		if (active.includes(projectId)) return { ok: true, activeProjectIds: active, previousProjectId: null };
		let setAside: string | null = null;
		if (active.length >= state.granted) {
			if (state.granted === 1) setAside = active[0];
			else if (setAsideProjectId && active.includes(setAsideProjectId)) setAside = setAsideProjectId;
			else {
				const nameOf = new Map(projects.map((p) => [p.id, p.name]));
				return { ok: false, reason: 'choose_set_aside', activeProjects: active.map((id) => ({ id, name: nameOf.get(id) ?? id })) };
			}
		}
		const next = [projectId, ...active.filter((id) => id !== setAside)].slice(0, state.granted);
		await this.store.save(next);
		return { ok: true, activeProjectIds: next, previousProjectId: setAside };
	}
}
