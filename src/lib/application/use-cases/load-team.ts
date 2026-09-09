import { emptyTeam, type Team } from '$domain/team/team';
import type { TeamGatewayPort } from '../ports/team-gateway';

/** Loads a project's team, degrading to an empty (solo) team. */
export class LoadTeamUseCase {
	constructor(private readonly gateway: TeamGatewayPort) {}

	async execute(projectId: string): Promise<Team> {
		const team = await this.gateway.getTeam(projectId);
		return team ?? emptyTeam();
	}
}
