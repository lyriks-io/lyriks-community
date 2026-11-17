import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ enforced: true }));
vi.mock('./auth-policy.server', () => ({ authEnforced: () => auth.enforced }));

const { resolveRole } = await import('./evolution-actor.server');

function services(opts: { link?: string | null; workspaces?: { id: string; role: string }[]; fails?: boolean; multiUser?: boolean }) {
	return {
		identity: { multiUser: opts.multiUser ?? true },
		backLinks: { find: async () => (opts.link ? { backWorkspaceId: opts.link } : null) },
		workspaces: {
			listForCaller: async () => {
				if (opts.fails) throw new Error('down');
				return (opts.workspaces ?? []).map((w) => ({ ...w, name: w.id }));
			}
		}
	} as never;
}

describe('the role of a change act is read in the project\'s workspace (issue 80) [state:session.workspaceRole]', () => {
	beforeEach(() => {
		auth.enforced = true;
	});

	const both = [
		{ id: 'mine', role: 'viewer' },
		{ id: 'team', role: 'designer' }
	];

	it('reads the designer of the project\'s workspace whatever the switcher shows', async () => {
		expect(await resolveRole(services({ link: 'team', workspaces: both }), 'p', 'mine')).toBe('member');
		expect(await resolveRole(services({ link: 'team', workspaces: both }), 'p', undefined)).toBe('member');
	});

	it('reads a viewer of the project\'s workspace even when the switcher shows one they own', async () => {
		const flipped = [
			{ id: 'mine', role: 'owner' },
			{ id: 'team', role: 'viewer' }
		];
		expect(await resolveRole(services({ link: 'team', workspaces: flipped }), 'p', 'mine')).toBe('viewer');
	});

	it('counts a role that cannot be read as viewer on a team installation', async () => {
		expect(await resolveRole(services({ link: 'team', fails: true }), 'p', undefined)).toBe('viewer');
		expect(await resolveRole(services({ link: 'gone', workspaces: both }), 'p', undefined)).toBe('viewer');
	});

	it('keeps the one operator a writer where no workspace owns the project', async () => {
		auth.enforced = false;
		expect(await resolveRole(services({ link: null, workspaces: [] }), 'p', undefined)).toBe('member');
		auth.enforced = true;
		expect(await resolveRole(services({ link: null, workspaces: [], multiUser: false }), 'p', undefined)).toBe('member');
	});
});
