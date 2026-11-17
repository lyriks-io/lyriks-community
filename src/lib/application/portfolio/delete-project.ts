import { canDeleteProject, emptyTeam } from '$domain/team';
import { styledProjectName } from '$domain/foundation';
import type {
	BehaviorRepositoryPort,
	ProjectMirrorPort,
	ProjectCatalogPort,
	TeamGatewayPort
} from '$application/ports';

/** Why a guarded delete was refused. */
export type DeleteProjectDenial = 'not_found' | 'name_mismatch' | 'not_owner';

export type DeleteProjectResult = { deleted: true } | { deleted: false; reason: DeleteProjectDenial };

export interface ConfirmedDeleteRequest {
	projectId: string;
	/** The project name the caller typed to confirm — must match the catalog name. */
	confirmName: string;
	/** Caller identity for the owner gate; null when there is no session. */
	requesterEmail: string | null;
	/**
	 * The caller's role in the workspace that holds the project (owner, admin,
	 * designer, viewer), or null where the project belongs to no workspace: a
	 * workspace owner or admin passes the owner gate.
	 */
	requesterWorkspaceRole: string | null;
	/** Owner gate applies only when auth is on (identity exists to check against). */
	enforceOwner: boolean;
}

/**
 * Delete a project and EVERY trace of it:
 *  1. the mirrored project on Lyriks-back (envelope + Unspaghettit workspace +
 *     DPO graph) — best-effort, and FIRST so the local↔back link still resolves;
 *  2. the local Unspaghettit workspace folder (`data/unspa/<id>/`);
 *  3. all PostgreSQL rows (every step draft + meta + the back link).
 *
 * Steps 1–2 are best-effort (their adapters swallow their own errors) so an
 * offline / mirror-disabled install still deletes everything it owns locally.
 */
export class DeleteProjectUseCase {
	constructor(
		private readonly catalog: ProjectCatalogPort,
		private readonly behavior: BehaviorRepositoryPort,
		private readonly back: ProjectMirrorPort,
		private readonly team: TeamGatewayPort
	) {}

	/**
	 * User-initiated delete, guarded twice: the caller must retype the exact
	 * project name (protects against misclicks and stale UI), and once an owner
	 * is specified on the team only the owner, or an owner or admin of the
	 * project's workspace, may delete (see `canDeleteProject`).
	 */
	async executeConfirmed(req: ConfirmedDeleteRequest): Promise<DeleteProjectResult> {
		const summary = (await this.catalog.list()).find((p) => p.id === req.projectId);
		if (!summary) return { deleted: false, reason: 'not_found' };
		// The catalog reads names in the one style (criterion 69aa0fef): the name retyped is read in it too.
		if (summary.name.trim() !== styledProjectName(req.confirmName)) {
			return { deleted: false, reason: 'name_mismatch' };
		}
		if (req.enforceOwner) {
			const team = (await this.team.getTeam(req.projectId)) ?? emptyTeam();
			if (!canDeleteProject(team, req.requesterEmail, req.requesterWorkspaceRole)) {
				return { deleted: false, reason: 'not_owner' };
			}
		}
		await this.execute(req.projectId);
		return { deleted: true };
	}

	/** Unconditional delete — also the rollback path after a failed creation. */
	async execute(projectId: string): Promise<void> {
		await this.back.deleteProject(projectId);
		await this.behavior.deleteProject(projectId);
		await this.catalog.remove(projectId);
	}
}
