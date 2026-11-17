import { describe, expect, it } from 'vitest';
import type { ProjectFolder } from '$domain/portfolio/project-folders';
import { folderKey, menuFolders, ORDER_KEY, projectKey } from './project-menu';

const p = (id: string) => ({ id, name: id.toUpperCase(), featureCount: 1, empty: false });
// As the menu reads them: the folders from A to Z, No folder last (criterion 4b3d2b4d).
const folders: ProjectFolder[] = [
	{ id: 'd2', name: 'Ops', position: null, projects: [] },
	{ id: 'd1', name: 'Retail', position: null, projects: [p('a'), p('b')] },
	{ id: null, name: 'No folder', position: null, projects: [p('c')] }
];
const names = (list: ReturnType<typeof menuFolders>) => list.map((f) => `${f.name}:${f.projects.map((x) => x.id).join(',')}${f.pending ? ' (pending)' : ''}`);

describe('the project menu while its acts are on their way', () => {
	it('reads as saved when nothing is on its way', () => {
		expect(menuFolders(folders, {})).toEqual(folders);
	});

	it('shows a project in its new folder at once, and one moved out of every folder under No folder', () => {
		// A project moved in takes its alphabetical place in its new folder.
		expect(names(menuFolders(folders, { [projectKey('b')]: { kind: 'move', to: null, toName: 'No folder' } }))).toEqual(['Ops:', 'Retail:a', 'No folder:b,c']);
		expect(names(menuFolders(folders, { [projectKey('a')]: { kind: 'move', to: 'd2', toName: 'Ops' } }))).toEqual(['Ops:a', 'Retail:b', 'No folder:c']);
		const noUnfiled = folders.slice(0, 2);
		expect(names(menuFolders(noUnfiled, { [projectKey('a')]: { kind: 'move', to: null, toName: 'No folder' } }))).toEqual(['Ops:', 'Retail:b', 'No folder:a']);
	});

	it('takes a deleted project and a deleted folder off at once', () => {
		expect(names(menuFolders(folders, { [projectKey('c')]: { kind: 'delete-project' }, [folderKey('d2')]: { kind: 'delete-folder' } }))).toEqual(['Retail:a,b', 'No folder:']);
	});

	it('shows a folder created here at its alphabetical place, before No folder, pending until the server gives it its id', () => {
		const act = { kind: 'add-folder' as const, name: 'Finance', known: folders.map((f) => f.id) };
		expect(names(menuFolders(folders, { [folderKey('new-1')]: act }))).toEqual(['Finance: (pending)', 'Ops:', 'Retail:a,b', 'No folder:c']);
		// Read back under its real id: it shows once, never twice.
		const read = [...folders.slice(0, 2), { id: 'd3', name: 'Finance', position: null, projects: [] }, folders[2]];
		expect(names(menuFolders(read, { [folderKey('new-1')]: act }))).toEqual(['Finance:', 'Ops:', 'Retail:a,b', 'No folder:c']);
	});

	it('reads a renamed folder under its new name at once, at its new alphabetical place [criterion:bb345125]', () => {
		expect(names(menuFolders(folders, { [folderKey('d1')]: { kind: 'rename-folder', name: 'Commerce' } }))).toEqual(['Commerce:a,b', 'Ops:', 'No folder:c']);
	});

	it('reads a dragged folder at its new place at once, No folder staying last [criterion:ddf5cc35] [action:5ccc378f]', () => {
		expect(names(menuFolders(folders, { [ORDER_KEY]: { kind: 'reorder', ids: ['d1', 'd2'] } }))).toEqual(['Retail:a,b', 'Ops:', 'No folder:c']);
	});

	it('keeps the dragged order under a rename, and reads a folder created since after the placed ones', () => {
		const placed: ProjectFolder[] = [
			{ id: 'd1', name: 'Retail', position: 0, projects: [] },
			{ id: 'd2', name: 'Ops', position: 1, projects: [] },
			{ id: null, name: 'No folder', position: null, projects: [] }
		];
		expect(names(menuFolders(placed, { [folderKey('d1')]: { kind: 'rename-folder', name: 'Zeta' } }))).toEqual(['Zeta:', 'Ops:', 'No folder:']);
		const act = { kind: 'add-folder' as const, name: 'Archive', known: placed.map((f) => f.id) };
		expect(names(menuFolders(placed, { [folderKey('new-1')]: act }))).toEqual(['Retail:', 'Ops:', 'Archive: (pending)', 'No folder:']);
	});
});
