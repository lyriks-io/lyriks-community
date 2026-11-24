import { describe, expect, it, vi } from 'vitest';
import { readerActivity } from './app-chrome-data.server';

/** Home greets the reader by the name their team knows them by, on any browser (criterion a975fd4c). */
describe("the reader's own name", () => {
	function read(pinned: string | null) {
		const execute = vi.fn(async (workspaceId: string | null) => (workspaceId ? `Mona of ${workspaceId}` : 'claude+mona'));
		const services = {
			currentSession: () => ({ email: 'claude+mona@lyriks.test' }),
			listProjects: { execute: async () => [] },
			backLinks: { find: async () => null },
			workspaces: {
				listForCaller: async () => [
					{ id: 'acme', name: 'Acme', role: 'designer' },
					{ id: 'other', name: 'Other', role: 'viewer' }
				],
				listMembers: async () => []
			},
			resolveActiveMemberName: { execute }
		} as never;
		const cookies = new Map(pinned ? [['lyriks_active_ws', pinned]] : []);
		return { execute, reading: readerActivity(services, { locals: { authRequired: false, services }, cookies: { get: (name: string) => cookies.get(name) } } as never) };
	}

	it('is read in their first workspace on a browser that never picked one, never off their email [criterion:a975fd4c]', async () => {
		const { execute, reading } = read(null);
		expect((await reading).myName).toBe('Mona of acme');
		expect(execute).toHaveBeenCalledWith('acme');
	});

	it('is read in the workspace the switcher pinned', async () => {
		expect((await read('other').reading).myName).toBe('Mona of other');
	});

	it('ignores a pinned workspace the reader is not in', async () => {
		expect((await read('elsewhere').reading).myName).toBe('Mona of acme');
	});
});
