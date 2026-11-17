import { describe, expect, it, vi } from 'vitest';
import { loadEvolutionMembers } from './evolution-view.server';

describe('Evolution validator suggestions [criterion:7dcc1258]', () => {
	it('uses only the reachable project roster from the owning workspace, including job names and access roles', async () => {
		const people = [{ email: 'tech@company.test', name: 'Tech', role: 'designer', jobIds: ['tech'], names: ['Tech'] }, { email: 'reader@company.test', name: 'Reader', role: 'viewer', jobIds: [], names: [] }];
		const participants = vi.fn(async () => people);
		const members = vi.fn();
		const loaded = await loadEvolutionMembers({
			backLinks: { find: async () => ({ backWorkspaceId: 'owning' }) },
			workspaces: { listForCaller: async () => [{ id: 'unrelated-active' }, { id: 'owning' }], listMembers: members },
			teamJobs: { participantsForProject: participants }
		} as never, 'project');
		expect(participants).toHaveBeenCalledWith('owning', 'project');
		expect(members).not.toHaveBeenCalled();
		expect(loaded).toEqual(people.map((person) => ({ id: person.email, name: person.name, role: person.role, jobs: person.names, jobIds: person.jobIds })));
	});

	it('does not fall back to an unrelated workspace if the owning workspace is unavailable', async () => {
		const participants = vi.fn();
		expect(await loadEvolutionMembers({
			backLinks: { find: async () => ({ backWorkspaceId: 'owning' }) },
			workspaces: { listForCaller: async () => [{ id: 'unrelated' }] },
			teamJobs: { participantsForProject: participants }
		} as never, 'project')).toEqual([]);
		expect(participants).not.toHaveBeenCalled();
	});
});
