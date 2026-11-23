import { describe, expect, it } from 'vitest';
import { workspaceRoster } from './project-activity.server';

const members: Record<string, Array<{ email: string; name?: string }>> = {
	active: [{ email: 'ana@a.test', name: 'Ana' }],
	owning: [{ email: 'bo@b.test', name: 'Bo' }]
};

const mine = [{ id: 'active', name: 'A', role: 'admin' }, { id: 'owning', name: 'O', role: 'viewer' }];

function services(links: Record<string, string | null>) {
	return {
		backLinks: { find: async (id: string) => (links[id] ? { backWorkspaceId: links[id] } : null) },
		workspaces: {
			listMembers: async (id: string) => members[id] ?? []
		}
	} as never;
}

/** The people of a project are those of its own workspace, never only the switcher's. */
describe('the roster of the visible projects', () => {
	it('reads the workspace that owns each project', async () => {
		const roster = await workspaceRoster(services({ p: 'owning' }), [{ id: 'p', name: 'P' }], mine, 'active');
		expect(roster).toEqual([{ id: 'bo@b.test', name: 'Bo' }]);
	});

	it('reads the active workspace for a project that belongs to none', async () => {
		const roster = await workspaceRoster(services({ p: null }), [{ id: 'p', name: 'P' }], mine, 'active');
		expect(roster).toEqual([{ id: 'ana@a.test', name: 'Ana' }]);
	});

	it('gathers the people of every owning workspace once', async () => {
		const roster = await workspaceRoster(services({ p: 'owning', q: 'active' }), [{ id: 'p', name: 'P' }, { id: 'q', name: 'Q' }], mine, 'active');
		expect(roster.map((m) => m.id).sort()).toEqual(['ana@a.test', 'bo@b.test']);
	});

	it('reads the first workspace for a project of none when the browser pinned no workspace', async () => {
		const roster = await workspaceRoster(services({ p: null }), [{ id: 'p', name: 'P' }], mine, null);
		expect(roster).toEqual([{ id: 'ana@a.test', name: 'Ana' }]);
	});
});
