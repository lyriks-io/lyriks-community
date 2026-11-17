import type { TeamGatewayPort } from '../ports/team-gateway';

export interface RemoveCollaboratorRequest {
	projectId: string;
	collaboratorId: string;
}

/** Removes a collaborator from a project's team. */
export class RemoveCollaboratorUseCase {
	constructor(private readonly gateway: TeamGatewayPort) {}

	execute(req: RemoveCollaboratorRequest): Promise<void> {
		return this.gateway.removeCollaborator(req.projectId, req.collaboratorId);
	}
}
