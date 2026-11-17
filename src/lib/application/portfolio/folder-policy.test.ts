import { describe, expect, it } from 'vitest';
import type { Domain } from '$domain/portfolio';
import type { CallerReach, WorkspaceReach } from './project-visibility';
import {
	FOLDER_NOT_FOUND,
	FOLDER_ORDER_REFUSAL,
	FOLDER_SCOPE_REFUSAL,
	VIEWER_FOLDER_REFUSAL,
	folderChange,
	folderCreation,
	folderForProject,
	folderOrdering,
	foldersVisibleTo
} from './folder-policy';

const folder = (id: string, workspaceId: string | null): Domain => ({
	id,
	name: id,
	description: '',
	icon: 'lucide:building-2',
	createdAt: '2026-01-01T00:00:00.000Z',
	workspaceId
});

function reach(workspaces: Record<string, WorkspaceReach>, activeId: string | null = Object.keys(workspaces)[0] ?? null): CallerReach {
	return { workspaces: new Map(Object.entries(workspaces)), activeId, email: 'ada@acme.test' };
}

const designer = (folders: string[] | null = null): WorkspaceReach => ({ role: 'designer', folders: folders && new Set(folders) });
const viewer: WorkspaceReach = { role: 'viewer', folders: null };

describe('folders belong to their workspace (issue 156)', () => {
	const domains = [folder('a1', 'ws-a'), folder('b1', 'ws-b'), folder('legacy', null)];

	it('lists only the folders of the caller\'s workspaces, in their reach there [rule:4d6baae5]', () => {
		expect(foldersVisibleTo(reach({ 'ws-a': designer() }), domains).map((d) => d.id)).toEqual(['a1']);
		expect(foldersVisibleTo(reach({ 'ws-a': designer(['zz']) }), domains)).toEqual([]);
		expect(foldersVisibleTo(null, domains)).toHaveLength(3);
	});

	it('reads another workspace\'s folder as absent [rule:f019e036] [rule:26a92163]', () => {
		expect(folderChange(reach({ 'ws-a': designer() }), folder('b1', 'ws-b'))).toEqual({ ok: false, status: 404, reason: FOLDER_NOT_FOUND });
	});

	it('files a project only in a folder of its own workspace [rule:2dba3d12]', () => {
		const r = reach({ 'ws-a': designer(), 'ws-b': designer() });
		expect(folderForProject(r, 'ws-a', folder('b1', 'ws-b'))).toBe('missing');
		expect(folderForProject(r, 'ws-a', folder('a1', 'ws-a'))).toBe('ok');
		expect(folderForProject(reach({ 'ws-a': designer(['a2']) }), 'ws-a', folder('a1', 'ws-a'))).toBe('outside');
		expect(folderForProject(null, null, folder('b1', 'ws-b'))).toBe('ok');
	});
});

describe('a viewer does not arrange the folders (issue 155)', () => {
	it('refuses a viewer who sees every folder to add one [rule:cfc8ad95]', () => {
		expect(folderCreation(reach({ 'ws-a': viewer }))).toEqual({ ok: false, status: 403, reason: VIEWER_FOLDER_REFUSAL });
	});

	it('refuses a viewer to rename or delete one [rule:e2a7dc48] [rule:2ceaa1cb]', () => {
		expect(folderChange(reach({ 'ws-a': viewer }), folder('a1', 'ws-a'))).toEqual({ ok: false, status: 403, reason: VIEWER_FOLDER_REFUSAL });
	});

	it('refuses a viewer of any listed workspace to reorder [rule:d4e01c6f]', () => {
		expect(folderOrdering(reach({ 'ws-a': designer(), 'ws-b': viewer }))).toEqual({ ok: false, status: 403, reason: VIEWER_FOLDER_REFUSAL });
	});

	it('keeps the limits it had for a limited member [rule:509fa7a1] [rule:f98a832d]', () => {
		expect(folderCreation(reach({ 'ws-a': designer(['a1']) }))).toEqual({ ok: false, status: 403, reason: FOLDER_SCOPE_REFUSAL });
		expect(folderOrdering(reach({ 'ws-a': designer(['a1']) }))).toEqual({ ok: false, status: 403, reason: FOLDER_ORDER_REFUSAL });
		expect(folderChange(reach({ 'ws-a': designer(['a1']) }), folder('a1', 'ws-a'))).toEqual({ ok: true });
	});

	it('adds a new folder to the workspace the switcher shows', () => {
		expect(folderCreation(reach({ 'ws-a': viewer, 'ws-b': designer() }, 'ws-b'))).toEqual({ ok: true, workspaceId: 'ws-b' });
		expect(folderCreation(null)).toEqual({ ok: true, workspaceId: null });
	});
});
