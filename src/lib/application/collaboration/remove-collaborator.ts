import type { TeamGatewayPort } from '../ports/team-gateway';

export interface RemoveCollaboratorRequest {
	projectId: string;
	collaboratorId: string;
}

/**
 * Removes a collaborator from a project's team. Resolves true once removed,
 * false when the team service could not be asked; a refusal is thrown.
 */
export class RemoveCollaboratorUseCase {
	constructor(private readonly gateway: TeamGatewayPort) {}

	execute(req: RemoveCollaboratorRequest): Promise<boolean> {
		return this.gateway.removeCollaborator(req.projectId, req.collaboratorId);
	}
}
