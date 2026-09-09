import { emptyTeam, type Collaborator, type Team } from '$domain/team/team';
import type { NewCollaboratorInput, TeamGatewayPort } from '$application/ports/team-gateway';
import type { ProjectResidueRepositoryPort } from '$application/ports/project-residue-repository';
import { parseTeam } from '$application/parse-team';

const SECTION = 'team';

/**
 * A project team persisted in the LOCAL project residue (section "team"), so the
 * standalone platform (Minimal Autonomous Product — `LYRIKS_BACK_URL` unset) has
 * real collaborators to assign work to, without the enterprise back. Mirrors the
 * `TeamGatewayPort` the back adapter implements, so reads/writes are identical.
 */
export class ResidueTeamGateway implements TeamGatewayPort {
	readonly enabled = true;
	constructor(private readonly residue: ProjectResidueRepositoryPort) {}

	async getTeam(projectId: string): Promise<Team | null> {
		return parseTeam(await this.residue.load(projectId, SECTION));
	}

	async addCollaborator(
		projectId: string,
		input: NewCollaboratorInput
	): Promise<Collaborator | null> {
		const team = (await this.getTeam(projectId)) ?? emptyTeam();
		const collaborator: Collaborator = {
			id: crypto.randomUUID(),
			name: input.name ?? '',
			email: input.email ?? '',
			color: (input.color as Collaborator['color']) ?? 'slate',
			role: (input.role as Collaborator['role']) ?? 'contributor',
			seniority: (input.seniority as Collaborator['seniority']) ?? 'ic',
			expertise: input.expertise ?? [],
			scope: input.scope ?? [],
			joinedAt: new Date().toISOString()
		};
		const next: Team = { collaborators: [...team.collaborators, collaborator] };
		await this.residue.save(projectId, SECTION, parseTeam(next) ?? next);
		return collaborator;
	}

	async removeCollaborator(projectId: string, collaboratorId: string): Promise<void> {
		const team = (await this.getTeam(projectId)) ?? emptyTeam();
		const next: Team = {
			collaborators: team.collaborators.filter((c) => c.id !== collaboratorId)
		};
		await this.residue.save(projectId, SECTION, next);
	}
}
