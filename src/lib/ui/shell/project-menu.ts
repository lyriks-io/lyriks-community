import { sortByName } from '$domain/shared';
import { inFolderOrder, UNFILED_FOLDER_NAME, type FolderProject, type ProjectFolder } from '$domain/portfolio/project-folders';

/**
 * The project menu as it reads while its acts are on their way: a folder
 * created shows at once (marked pending until the server gives it its id), a
 * folder renamed reads its new name at its new place, a folder or a project
 * deleted is gone, a project moved sits in its new folder, a folder dragged
 * reads at its new place (action 5ccc378f).
 * Keyed by what each act touches: `folder:<id>` (a created folder under the
 * id the page gave it), `project:<id>` and ORDER_KEY for the folders' order.
 * Pure.
 */
export type MenuAct =
	/** `known`: the folders the menu held when it was created, so the saved one is told from them. */
	| { readonly kind: 'add-folder'; readonly name: string; readonly known: readonly (string | null)[] }
	| { readonly kind: 'delete-folder' }
	| { readonly kind: 'rename-folder'; readonly name: string }
	| { readonly kind: 'move'; readonly to: string | null; readonly toName: string }
	| { readonly kind: 'delete-project' }
	/** `ids`: every folder top to bottom, as the drag left them (what the reorder saves). */
	| { readonly kind: 'reorder'; readonly ids: readonly string[] };

export interface MenuFolder extends ProjectFolder {
	/** Created here and not saved yet: nothing can be filed in it before it has its id. */
	readonly pending?: boolean;
}

export const folderKey = (id: string | null) => `folder:${id ?? ''}`;
export const projectKey = (id: string) => `project:${id}`;
/** One key for the order: a second drag replaces the first on the page and saves after it. */
export const ORDER_KEY = 'order:folders';

export function menuFolders(folders: readonly ProjectFolder[], acts: Readonly<Record<string, MenuAct>>): MenuFolder[] {
	const actOn = (key: string) => acts[key] ?? null;
	const moved = new Map<string | null, FolderProject[]>();
	const kept: MenuFolder[] = folders
		.filter((f) => actOn(folderKey(f.id))?.kind !== 'delete-folder')
		.map((f) => {
			const act = actOn(folderKey(f.id));
			return act?.kind === 'rename-folder' ? { ...f, name: act.name } : f;
		})
		.map((f) => ({
			...f,
			projects: f.projects.filter((p) => {
				const act = actOn(projectKey(p.id));
				if (act?.kind === 'delete-project') return false;
				if (act?.kind !== 'move' || act.to === f.id) return true;
				moved.set(act.to, [...(moved.get(act.to) ?? []), p]);
				return false;
			})
		}));
	for (const [to, projects] of moved) {
		const at = kept.findIndex((f) => f.id === to);
		if (at >= 0) kept[at] = { ...kept[at], projects: [...kept[at].projects, ...projects] };
		else if (to === null) kept.push({ id: null, name: UNFILED_FOLDER_NAME, position: null, projects });
	}
	// Once the menu read the saved folder (one it did not know, under that name), it stands for the created one.
	const saved = (act: { name: string; known: readonly (string | null)[] }) => folders.some((f) => f.name === act.name && !act.known.includes(f.id));
	const created: MenuFolder[] = Object.entries(acts).flatMap(([key, act]) =>
		act.kind === 'add-folder' && !saved(act) ? [{ id: key.slice('folder:'.length), name: act.name, position: null, projects: [], pending: true }] : []
	);
	// A drag on its way: every folder it names stands at its index at once.
	const order = acts[ORDER_KEY];
	const placedAt = order?.kind === 'reorder' ? new Map(order.ids.map((id, i) => [id, i])) : null;
	const placed = placedAt ? kept.map((f) => (f.id !== null && placedAt.has(f.id) ? { ...f, position: placedAt.get(f.id) ?? null } : f)) : kept;
	// The folders in their dragged order, those nobody placed (a created one at once) from A to Z after them, the
	// projects filed nowhere last; the projects of each folder from A to Z (criteria ddf5cc35, 4b3d2b4d).
	const inOrder = (f: MenuFolder): MenuFolder => ({ ...f, projects: sortByName(f.projects) });
	return inFolderOrder([...placed, ...created]).map(inOrder);
}
