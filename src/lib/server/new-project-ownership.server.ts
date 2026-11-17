import type { AppServices } from '$composition/container.server';
import type { WorkspaceSummary } from '$application/ports';
import { error } from '@sveltejs/kit';
import { seedOwnerCollaborator } from './seed-owner-collaborator.server';

/**
 * The ownership half of "a project came into being here" — shared by every route
 * that mints one (create, import).
 *
 * Auth-on, a new project must be owned by the caller's team from the moment it
 * exists, or the fail-closed per-project scope locks its own creator out of it.
 * That is a two-step invariant (mirror to the back, then seed the owner
 * collaborator) with a rollback in the middle, which is precisely the kind of
 * sequence that must not be re-derived per route.
 */

/** Refusal of rules 029ff8b4 and 9c7b8a91: only a writer of a workspace adds a project to it. */
export const VIEWER_CREATION_REFUSAL = 'Only an owner, admin or designer of the workspace can create a project.';

/** What names the workspace a new project belongs to, strongest first. */
export interface OwningWorkspaceHints {
	/** The workspace the request names (an AI client, the dialog, an import). */
	readonly requested: string | null;
	/** The workspace of the folder the project is filed in (the panel's + Project). */
	readonly folderWorkspaceId?: string | null;
	/** The workspace the browser pinned with the switcher (issue 108); an AI client pins none. */
	readonly pinned?: string | null;
}

/**
 * Resolve the workspace a new project belongs to, validating membership so a
 * caller can never register a project into a team they are not in: the one the
 * request names, else the one of the folder it is filed in, else the one the
 * switcher pinned, else their only one. Returns null on a standalone (auth-off)
 * install: single trusted tenant, no team to pin. The caller's role comes with
 * it, read in that workspace.
 */
export async function resolveOwningWorkspace(
	services: AppServices, locals: App.Locals,
	hints: OwningWorkspaceHints
): Promise<WorkspaceSummary | null> {
	if (!locals.authRequired) return null;
	// A single-operator install (auth on, no Back) has no team to pin either.
	if (!services.identity.multiUser) return null;

	const teams = await services.workspaces.listForCaller();
	if (teams.length === 0) {
		error(409, 'You are not a member of any workspace yet. Ask your administrator to invite you to one.');
	}
	const member = (id: string | null | undefined) => (id ? teams.find((t) => t.id === id) : undefined);
	if (hints.requested) {
		const requested = member(hints.requested);
		if (!requested) error(403, 'You are not a member of that workspace.');
		return requested;
	}
	const implied = member(hints.folderWorkspaceId) ?? member(hints.pinned) ?? (teams.length === 1 ? teams[0] : undefined);
	if (implied) return implied;
	error(400, 'workspaceId is required when you belong to more than one workspace.');
}

/**
 * Mirror a just-created project to the back and make the caller its owner.
 * Rolls the project back and fails the request if the mirror never lands — an
 * unowned project is worse than no project. No-op when auth is off.
 *
 * Must run inside the pinned request context (token + target workspace).
 */
export async function ownNewProject(
	services: AppServices, locals: App.Locals,
	projectId: string,
	auditAction: string
): Promise<void> {
	if (!locals.authRequired) return;
	// No Back to mirror to, and the one operator already owns everything.
	if (!services.identity.multiUser) return;
	await services.pushEnvelopeToBack.execute(projectId);
	const link = await services.backLinks.find(projectId);
	if (!link) {
		await services.deleteProject.execute(projectId);
		services.audit.record({
			action: auditAction,
			actor: locals.session?.email ?? 'anonymous',
			target: projectId,
			outcome: 'failure',
			detail: 'back registration failed'
		});
		error(502, 'Could not register the project on the server. Please try again.');
	}
	await seedOwnerCollaborator(services, projectId, locals.session?.email);
}
