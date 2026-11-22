import { describe, expect, it } from 'vitest';
import type { Collaborator } from '$domain/team';
import type { NewCollaboratorInput, TeamGatewayPort } from '../ports/team-gateway';
import { AddCollaboratorUseCase, InvalidCollaboratorError } from './add-collaborator';

function team() {
	const added: NewCollaboratorInput[] = [];
	const gateway = {
		enabled: true,
		getTeam: async () => null,
		addCollaborator: async (_projectId: string, input: NewCollaboratorInput): Promise<Collaborator> => {
			added.push(input);
			return { id: 'c1', name: input.name, email: input.email ?? '', color: 'blue', role: 'contributor', seniority: 'ic', expertise: [], scope: [], joinedAt: 'now' };
		},
		removeCollaborator: async () => false
	} satisfies TeamGatewayPort;
	return { added, add: new AddCollaboratorUseCase(gateway) };
}

describe("adding a collaborator to a project's team", () => {
	it('adds them under their trimmed name', async () => {
		const { added, add } = team();
		expect((await add.execute({ projectId: 'p', name: '  Ana  ', email: 'ana@acme.io' }))?.name).toBe('Ana');
		expect(added).toEqual([{ name: 'Ana', email: 'ana@acme.io' }]);
	});

	it('refuses a collaborator without a name and adds nobody', async () => {
		const { added, add } = team();
		await expect(add.execute({ projectId: 'p', name: '   ' })).rejects.toBeInstanceOf(InvalidCollaboratorError);
		expect(added).toEqual([]);
	});
});
