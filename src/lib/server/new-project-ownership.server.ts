import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
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

/**
 * Resolve the workspace a new project belongs to, validating membership so a
 * caller can never register a project into a team they are not in. Returns null
 * on a standalone (auth-off) install: single trusted tenant, no team to pin.
 */
export async function resolveOwningWorkspace(
	locals: App.Locals,
	requestedWorkspaceId: string | null
): Promise<string | null> {
	if (!locals.authRequired) return null;
	// A single-operator install (auth on, no Back) has no team to pin either.
	if (!getServices().identity.multiUser) return null;

	const teams = await getServices().workspaces.listForCaller();
	if (teams.length === 0) {
		error(409, 'You are not a member of any workspace yet. Ask your administrator to invite you to one.');
	}
	if (requestedWorkspaceId) {
		if (!teams.some((t) => t.id === requestedWorkspaceId)) {
			error(403, 'You are not a member of that workspace.');
		}
		return requestedWorkspaceId;
	}
	if (teams.length === 1) return teams[0].id;
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
	locals: App.Locals,
	projectId: string,
	auditAction: string
): Promise<void> {
	if (!locals.authRequired) return;

	const services = getServices();
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
	await seedOwnerCollaborator(projectId, locals.session?.email);
}
