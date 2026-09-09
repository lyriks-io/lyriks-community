import type { ProjectResidueRepositoryPort, UsersDraftRepositoryPort } from '$application/ports';
import {
	buildUsersProjection,
	usersResidueFromDraft,
	type UsersResidue
} from '$application/projection/users-projection';
import type { ProjectUsersDraft } from '$domain/users';

const SECTION = 'users';

/**
 * The Users section (Step 03), backed by the generalized project-residue store
 * instead of a bespoke draft table (Phase 4 of unify-unspa-kernel). Satisfies
 * the same `UsersDraftRepositoryPort` every consumer depends on, so swapping it in at
 * the composition root flips the section with no consumer churn.
 *
 * Users' behavioral half — the actor **personas** — already lands in the kernel via
 * the Experience projection (actor-roles → unspa personas), so this adapter is purely
 * residue-backed and does NOT touch the `BehaviorPort` (mirroring the Rules flip). A
 * one-shot, idempotent backfill seeds the residue from the legacy section document on
 * first read so the flip never blanks an existing project.
 */
export class ResidueUsersDraftRepository implements UsersDraftRepositoryPort {
	constructor(
		private readonly residue: ProjectResidueRepositoryPort,
		/** Legacy section store, read once to migrate a pre-residue project. */
		private readonly legacy: UsersDraftRepositoryPort
	) {}

	async load(projectId: string): Promise<ProjectUsersDraft | null> {
		let residue = (await this.residue.load(projectId, SECTION)) as UsersResidue | null;

		// First-read migration: an existing project with authored content but no residue
		// yet gets seeded from its legacy draft (idempotent once the residue exists).
		if (residue === null) {
			const legacy = await this.legacy.load(projectId);
			if (legacy && hasAuthoredContent(legacy)) {
				await this.save(legacy);
				residue = (await this.residue.load(projectId, SECTION)) as UsersResidue | null;
			}
		}

		if (residue === null) return null; // nothing authored yet
		return buildUsersProjection(projectId, residue);
	}

	async save(draft: ProjectUsersDraft): Promise<void> {
		await this.residue.save(draft.projectId, SECTION, usersResidueFromDraft(draft));
	}
}

/** Whether the legacy draft carries anything worth migrating (avoid seeding empties). */
function hasAuthoredContent(draft: ProjectUsersDraft): boolean {
	return (
		draft.roles.length > 0 ||
		draft.offStructureCapabilities.length > 0 ||
		draft.permissions.length > 0
	);
}
