import type { RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { isProjectVisible, type ProjectVisibility } from '$application/project-visibility';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';

/**
 * The caller's project visibility for this request: the domain-scope breadth
 * (`null` = blanket — auth off, owner/admin, or "all projects") plus their email
 * for per-project collaborator grants. Fed to `isProjectVisible` for both the
 * listing filters (portfolio/search) and the single-project open guard, so every
 * surface shares one rule. See `$application/project-visibility`.
 */
export async function callerProjectVisibility(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
): Promise<ProjectVisibility> {
	const allowedDomainIds = await callerAllowedDomains(event);
	return { allowedDomainIds, email: event.locals.session?.email ?? null };
}

/**
 * Whether the caller may see/open a single project. Workspace membership is
 * enforced upstream; this adds the domain-breadth ∪ collaborator grant. Resolves
 * the project's domain locally and consults the team only when the domain isn't
 * already in breadth.
 */
export async function callerCanSeeProject(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
): Promise<boolean> {
	const visibility = await callerProjectVisibility(event);
	if (visibility.allowedDomainIds === null) return true;
	const services = getServices();
	const meta = await services.portfolio.getMeta(projectId).catch(() => null);
	return isProjectVisible(projectId, meta?.domainId ?? null, visibility, (id) =>
		services.loadTeam.execute(id),
	);
}
