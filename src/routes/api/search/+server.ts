import { json } from '@sveltejs/kit';
import { callerReach } from '$lib/server/domain-scope.server';
import type { RequestHandler } from './$types';

/** Global search backing the header box: GET /api/search?q=… — scoped to the
    caller's own workspaces and per-project visibility (domain breadth ∪
    collaborations) when auth is on (multi-tenant isolation). */
export const GET: RequestHandler = async (event) => {
	const q = event.url.searchParams.get('q') ?? '';
	const results = await event.locals.services.searchPortfolio.execute(q, await callerReach(event));
	return json({ results });
};
