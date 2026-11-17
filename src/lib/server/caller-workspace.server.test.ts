import { describe, expect, it } from 'vitest';
import { callerRoleInProjectWorkspace, callerWorkspaceForProject, workspaceForProject } from './caller-workspace.server';

function services(link: { backWorkspaceId: string } | null, workspaces: Array<{ id: string; role: string }>) {
	return {
		backLinks: { find: async () => link },
		workspaces: { listForCaller: async () => workspaces }
	} as never;
}

describe('the caller role in the workspace that owns a project', () => {
	it('reads the role in the owning workspace, never in another one the caller administers', async () => {
		const both = [{ id: 'other', role: 'admin' }, { id: 'owning', role: 'designer' }];
		expect(await callerRoleInProjectWorkspace(services({ backWorkspaceId: 'owning' }, both), 'p')).toBe('designer');
	});

	it('is null when the project belongs to no workspace or the caller is not in it', async () => {
		expect(await callerRoleInProjectWorkspace(services(null, [{ id: 'owning', role: 'admin' }]), 'p')).toBeNull();
		expect(await callerRoleInProjectWorkspace(services({ backWorkspaceId: 'owning' }, [{ id: 'other', role: 'admin' }]), 'p')).toBeNull();
	});
});

describe('the workspace a project is acted on in', () => {
	const both = [{ id: 'active', role: 'admin' }, { id: 'owning', role: 'viewer' }];

	it('is the owning workspace, whatever the switcher pinned', async () => {
		expect(await workspaceForProject(services({ backWorkspaceId: 'owning' }, both), 'p', 'active')).toBe('owning');
		expect(await callerWorkspaceForProject(services({ backWorkspaceId: 'owning' }, both), 'p', 'active')).toEqual({ id: 'owning', role: 'viewer' });
	});

	it('is the pinned one for a project that belongs to no workspace', async () => {
		expect(await workspaceForProject(services(null, both), 'p', 'active')).toBe('active');
		expect(await workspaceForProject(services(null, both), 'p', undefined)).toBeNull();
		expect(await callerWorkspaceForProject(services(null, both), 'p', 'owning')).toEqual({ id: 'owning', role: 'viewer' });
		expect(await callerWorkspaceForProject(services(null, both), 'p', null)).toEqual({ id: 'active', role: 'admin' });
	});

	it('is none when the caller is not in the owning workspace, never another one they administer', async () => {
		expect(await callerWorkspaceForProject(services({ backWorkspaceId: 'elsewhere' }, both), 'p', 'active')).toBeNull();
	});
});
