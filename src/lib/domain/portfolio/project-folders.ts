import { compareNames, sortByName } from '../shared/alphabetical';
import type { PortfolioView, ProjectCard } from './index';

/**
 * The project menu of the app bar reads the portfolio as folders: a folder is a
 * domain, and the projects filed under no domain gather in a last folder of
 * their own, so every visible project can be reached from the menu.
 */
export interface FolderProject {
	readonly id: string;
	readonly name: string;
	readonly featureCount: number;
	/** Nothing written yet: deleting it loses nothing, so it asks no confirmation. */
	readonly empty: boolean;
}

export interface ProjectFolder {
	/** The domain id; null for the projects filed under no domain. */
	readonly id: string | null;
	readonly name: string;
	/** Its place as the folders were last dragged (state domain.position); null while nobody placed it, and for No folder. */
	readonly position: number | null;
	readonly projects: readonly FolderProject[];
}

export const UNFILED_FOLDER_NAME = 'No folder';

/** A project is empty while it has no feature, no evolution and has not left ideation. */
export function isEmptyProject(card: Pick<ProjectCard, 'featureCount' | 'evolutionsInProgress' | 'stage'>): boolean {
	return card.featureCount === 0 && card.evolutionsInProgress === 0 && card.stage === 'ideation';
}

function toFolderProject(card: ProjectCard): FolderProject {
	return { id: card.id, name: card.name, featureCount: card.featureCount, empty: isEmptyProject(card) };
}

const placed = (f: Pick<ProjectFolder, 'position'>): f is { position: number } => typeof f.position === 'number' && f.position >= 0;

/**
 * The folders in the order the team dragged them into (criterion ddf5cc35):
 * the placed ones by their place, then the ones nobody placed yet (all of them
 * before the first drag, a folder created since) from A to Z, No folder last
 * whatever it holds. Ties between two placed folders read A to Z. Returns a
 * sorted copy. Pure.
 */
export function inFolderOrder<T extends Pick<ProjectFolder, 'id' | 'name' | 'position'>>(folders: readonly T[]): T[] {
	const rank = (f: T) => (f.id === null ? 2 : placed(f) ? 0 : 1);
	return [...folders].sort((a, b) => rank(a) - rank(b) || (placed(a) && placed(b) ? a.position - b.position : 0) || compareNames(a.name, b.name));
}

/** The folders in their dragged order, the projects filed nowhere last, the projects of each from A to Z (criteria ddf5cc35, 4b3d2b4d). */
export function projectFolders(view: PortfolioView): ProjectFolder[] {
	const folders: ProjectFolder[] = view.domains.map((d) => ({
		id: d.domain.id,
		name: d.domain.name,
		position: d.domain.position ?? null,
		projects: sortByName(d.projects.map(toFolderProject))
	}));
	if (view.unassigned.length > 0) {
		folders.push({ id: null, name: UNFILED_FOLDER_NAME, position: null, projects: sortByName(view.unassigned.map(toFolderProject)) });
	}
	return inFolderOrder(folders);
}

/**
 * The folders once one was dropped at `to` (action 5ccc378f): the domain ids
 * top to bottom, what the reorder saves. No folder is never among them and
 * never moves (rule a20195a8); a drop outside the list, or of a folder that is
 * not there, answers null: nothing to save.
 */
export function droppedOrder(folders: readonly Pick<ProjectFolder, 'id'>[], moved: string, to: number): string[] | null {
	const ids = folders.flatMap((f) => (f.id === null ? [] : [f.id]));
	const from = ids.indexOf(moved);
	if (from < 0 || to < 0 || to >= ids.length || to === from) return null;
	const rest = ids.filter((id) => id !== moved);
	return [...rest.slice(0, to), moved, ...rest.slice(to)];
}
