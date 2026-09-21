import { simulate, type SimRequest, type SimResult } from '$domain/experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';
import type { LoadUsersDraftUseCase } from './load-users-draft';

/**
 * A run asked for as a role the project does not define. Refused instead of
 * run as nobody: a persona argument that is accepted and ignored is worse than
 * no argument at all, because the run then reads as a proof about a role while
 * it was made with every gate open.
 */
export class UnknownPersonaError extends Error {
	constructor(personaId: string, known: readonly { id: string; name: string }[]) {
		super(
			`"${personaId}" is not a role of this project. ` +
				(known.length > 0
					? `Run as one of: ${known.map((role) => `${role.id} (${role.name || 'unnamed'})`).join(', ')}.`
					: 'This project declares no role yet: author them in the users section, or omit persona_id to run as the author.')
		);
		this.name = 'UnknownPersonaError';
	}
}

/**
 * Headlessly run a prototype: load the experience draft and fold the scripted
 * actions through the pure run-mode engine ({@link simulate}). Read-only — a run
 * is ephemeral by design, so nothing is persisted. This is the "verify" half of
 * the authoring loop the MCP exposes alongside `build_screen`.
 *
 * The roles are loaded too, for one reason: to refuse a persona nobody declared.
 */
export class SimulateExperienceUseCase {
	constructor(
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase
	) {}

	async execute(projectId: string, req: SimRequest): Promise<SimResult> {
		const [draft, users] = await Promise.all([
			this.loadExperience.execute(projectId),
			this.loadUsers.execute(projectId)
		]);
		const personaId = req.personaId ?? null;
		if (personaId !== null && !users.roles.some((role) => role.id === personaId)) {
			throw new UnknownPersonaError(
				personaId,
				users.roles.map((role) => ({ id: role.id, name: role.name }))
			);
		}
		return simulate(draft.builder, req);
	}
}
