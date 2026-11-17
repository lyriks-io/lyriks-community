import type { Collaborator, Team } from '$domain/team';

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
 * domain types. Reads and grants are best-effort, like the rest of the back
 * integration: they return `null` when the mirror is disabled, the back is
 * unreachable, or the project isn't mirrored yet. Removal reports its outcome
 * (see `removeCollaborator`).
 */
export interface TeamGatewayPort {
	/** False when the back mirror is disabled (LYRIKS_BACK_URL unset). */
	readonly enabled: boolean;

	getTeam(localProjectId: string): Promise<Team | null>;
	addCollaborator(localProjectId: string, input: NewCollaboratorInput): Promise<Collaborator | null>;
	/**
	 * Take a place off the project's team. True once it is off; false when the
	 * team service could not be asked, so nothing was taken back. A refusal of
	 * the team service (an owner's place, a place of another project) is thrown
	 * as a `BackHttpError`, never swallowed: access must not read as withdrawn
	 * while it is kept (issue 151).
	 */
	removeCollaborator(localProjectId: string, collaboratorId: string): Promise<boolean>;
}
