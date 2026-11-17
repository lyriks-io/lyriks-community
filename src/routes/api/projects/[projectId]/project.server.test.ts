import { describe, expect, it, vi } from 'vitest';

const updateProject = vi.fn(async (input: { name: string }) => ({ updated: true, name: input.name.trim() ? `${input.name.trim()[0].toUpperCase()}${input.name.trim().slice(1)}` : 'Linkding' }));

vi.mock('$composition/container.server', () => ({
	getServices: () => ({
		listProjects: { execute: async () => [{ id: 'linkding-2fa72d' }] },
		loadFoundationDraft: { loadIdentity: async () => ({ productName: 'Linkding', brief: 'Bookmarks' }) },
		portfolio: { getMeta: async () => null },
		listDomains: { execute: async () => [] },
		updateProject: { execute: updateProject },
		scheduleBackSync: async () => {},
		audit: { record: () => {} }
	})
}));
import { getServices } from '$composition/container.server';
vi.mock('$lib/server/project-access.server', () => ({ requireProjectAccess: async () => {} }));
vi.mock('$lib/server/domain-scope.server', () => ({ callerReach: async () => null }));

const { PATCH } = await import('./+server');

const patch = (body: Record<string, unknown>) =>
	PATCH({
		params: { projectId: 'linkding-2fa72d' },
		request: new Request('http://x/api/projects/linkding-2fa72d', { method: 'PATCH', body: JSON.stringify(body) }),
		locals: { services: getServices() }
	} as never);

describe('PATCH /api/projects/[projectId] answers with the name as it will read [criterion:60d1fbca]', () => {
	it('names the name sent, the name kept and why when the one style changed it', async () => {
		const answer = await (await patch({ name: 'linkding' })).json();
		expect(answer).toEqual({
			updated: true,
			projectId: 'linkding-2fa72d',
			name: 'Linkding',
			nameStyled: { sent: 'linkding', kept: 'Linkding', reason: expect.stringContaining('opens on a capital') }
		});
	});

	it('answers the name alone when it was taken as typed, or when only the description moved', async () => {
		expect(await (await patch({ name: 'Linkding' })).json()).toEqual({ updated: true, projectId: 'linkding-2fa72d', name: 'Linkding' });
		expect(await (await patch({ description: 'Saved links' })).json()).toEqual({ updated: true, projectId: 'linkding-2fa72d', name: 'Linkding' });
	});
});
