import type { AppServices } from '$composition/container.server';
import { sameEmail } from '$domain/team';

/** Display name from an email local-part ("ada.lovelace" → "ada.lovelace"), fallback to the email. */
function nameFromEmail(email: string): string {
	const local = email.split('@')[0]?.trim();
	return local && local.length > 0 ? local : email;
}

/**
 * Register the project creator as the `owner` collaborator on their new project.
 *
 * Under per-project scope (see `canSeeProjectAsCollaborator`), a non-privileged
 * workspace member only sees the projects they're a collaborator on. A freshly
 * created project starts with an empty team, so without this seed a `designer`
 * who creates a project would immediately be scoped out of their own project.
 * The owner row also makes attribution correct from creation.
 *
 * Best-effort and idempotent-ish: mirrors the rest of the back integration —
 * a failure here must never break project creation (the creator can still be
 * an owner/admin of the workspace, which bypasses scope). Requires the project
 * to be mirrored already (call after the back link is confirmed) and the caller
 * token to be in the ambient request context.
 */
export async function seedOwnerCollaborator(
	services: AppServices, projectId: string,
	email: string | undefined,
): Promise<void> {
	if (!email) return;
	try {
		// Current Back creates this owner atomically with the project. Keep the
		// legacy seed for older services without duplicating that authority row.
		const team = await services.loadTeam.execute(projectId);
		if (team.collaborators.some((person) => person.role === 'owner' && sameEmail(person.email, email))) return;
		await services.addCollaborator.execute({
			projectId,
			name: nameFromEmail(email),
			email,
			role: 'owner',
		});
	} catch (e) {
		console.warn('[team] seedOwnerCollaborator failed (best-effort):', e);
	}
}
