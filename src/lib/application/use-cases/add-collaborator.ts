import type { Collaborator } from '$domain/team/team';
import type { NewCollaboratorInput, TeamGatewayPort } from '../ports/team-gateway';

/** Thrown when a collaborator payload is malformed (mapped to 422 in transport). */
export class InvalidCollaboratorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidCollaboratorError';
	}
}

export interface AddCollaboratorRequest extends NewCollaboratorInput {
	projectId: string;
}

/** Adds a collaborator to a project's team. */
export class AddCollaboratorUseCase {
	constructor(private readonly gateway: TeamGatewayPort) {}

	async execute({ projectId, ...input }: AddCollaboratorRequest): Promise<Collaborator | null> {
		if (!input.name || input.name.trim().length === 0) {
			throw new InvalidCollaboratorError('A name is required.');
		}
		return this.gateway.addCollaborator(projectId, { ...input, name: input.name.trim() });
	}
}
