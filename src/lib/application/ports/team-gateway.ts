import type { Collaborator, Team } from '$domain/team/team';

/** Fields accepted when adding a collaborator (server fills id + joinedAt). */
export interface NewCollaboratorInput {
	name: string;
	email?: string;
	color?: string;
	role?: string;
	seniority?: string;
	expertise?: string[];
	scope?: string[];
}

/**
 * Outbound port to the project-collaborators API. Speaks v3 project ids; the
 * adapter resolves the back project and translates the REST envelope into
 * domain types. Best-effort, like the rest of the back integration: returns
 * `null` (read/write) / no-op when the mirror is disabled, the back is
 * unreachable, or the project isn't mirrored yet.
 */
export interface TeamGatewayPort {
	/** False when the back mirror is disabled (LYRIKS_BACK_URL unset). */
	readonly enabled: boolean;

	getTeam(localProjectId: string): Promise<Team | null>;
	addCollaborator(localProjectId: string, input: NewCollaboratorInput): Promise<Collaborator | null>;
	removeCollaborator(localProjectId: string, collaboratorId: string): Promise<void>;
}
