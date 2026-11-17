import type { RequestEvent } from '@sveltejs/kit';
import { isProjectVisible, visibilityIn } from '$application/portfolio/project-visibility';
import { callerReach } from '$lib/server/domain-scope.server';
import { projectWorkspaceId } from '$lib/server/caller-workspace.server';

/**
 * Whether the caller may see/open a single project. Workspace membership is
 * enforced upstream; this adds the domain-breadth ∪ collaborator grant, read in
 * the workspace that owns the project (issue 150), never in the one the switcher
 * shows. Resolves the project's domain locally and consults the team only when
 * the domain isn't already in breadth.
 */
export async function callerCanSeeProject(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
): Promise<boolean> {
	const reach = await callerReach(event);
	if (reach === null) return true;
	const services = event.locals.services;
	const visibility = visibilityIn(reach, await projectWorkspaceId(services, projectId));
	if (visibility.allowedDomainIds === null) return true;
	const meta = await services.portfolio.getMeta(projectId).catch(() => null);
	return isProjectVisible(projectId, meta?.domainId ?? null, visibility, (id) =>
		services.loadTeam.execute(id),
	);
}
