import { json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { callerWorkspaceScope } from '$lib/server/workspace-scope.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import type { RequestHandler } from './$types';

/** Global search backing the header box: GET /api/search?q=… — scoped to the
    caller's own workspaces and per-project visibility (domain breadth ∪
    collaborations) when auth is on (multi-tenant isolation). */
export const GET: RequestHandler = async (event) => {
	const q = event.url.searchParams.get('q') ?? '';
	const scope = await callerWorkspaceScope(event);
	const allowedDomains = await callerAllowedDomains(event);
	const results = await getServices().searchPortfolio.execute(
		q,
		scope,
		allowedDomains,
		event.locals.session?.email ?? null
	);
	return json({ results });
};
