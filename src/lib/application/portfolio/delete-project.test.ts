import { describe, expect, it, vi } from 'vitest';
import { DeleteProjectUseCase } from './delete-project';

const owner = { id: 'c1', name: 'Gone', email: 'gone@company.test', role: 'owner', color: 'slate', seniority: 'ic', expertise: [], scope: [], joinedAt: '' };

function deletion() {
	const remove = vi.fn(async () => {});
	const useCase = new DeleteProjectUseCase(
		{ list: async () => [{ id: 'p', name: 'Billing' }], remove } as never,
		{ deleteProject: async () => {} } as never,
		{ deleteProject: async () => {} } as never,
		{ getTeam: async () => ({ collaborators: [owner] }) } as never
	);
	const as = (requesterWorkspaceRole: string | null) =>
		useCase.executeConfirmed({
			projectId: 'p',
			confirmName: 'Billing',
			requesterEmail: 'someone@company.test',
			requesterWorkspaceRole,
			enforceOwner: true
		});
	return { as, remove };
}

describe('deleting a project whose owner is someone else (issue 262)', () => {
	it.each(['admin', 'owner'])('lets a workspace %s delete it [unspa:039deda8:0e12f1fb:f99d9cb8]', async (role) => {
		const { as, remove } = deletion();
		expect(await as(role)).toEqual({ deleted: true });
		expect(remove).toHaveBeenCalledWith('p');
	});

	it.each(['designer', 'viewer', null])('refuses a %s who is not among its owners [unspa:039deda8:0e12f1fb:2961d9f6]', async (role) => {
		const { as, remove } = deletion();
		expect(await as(role)).toEqual({ deleted: false, reason: 'not_owner' });
		expect(remove).not.toHaveBeenCalled();
	});
});
