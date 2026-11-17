import { error, json } from '@sveltejs/kit';
import { callerReach } from '$lib/server/domain-scope.server';
import { folderOrdering } from '$application/portfolio/folder-policy';
import { workspaceIdsOf } from '$application/portfolio/project-visibility';
import type { RequestHandler } from './$types';

/**
 * Put the folders of the projects in a new order (action a9dc11a9): the body
 * is `{ ids }`, every folder the caller's panel lists, from top to bottom. The
 * order is the same for everyone, so a member who sees only some folders is
 * refused (rule f98a832d), and a viewer too (rule d4e01c6f); a list that is not
 * the folders of the caller's workspaces as they stand is refused (rule 50e3ed19).
 */
export const PUT: RequestHandler = async (event) => {
	const reach = await callerReach(event);
	const verdict = folderOrdering(reach);
	if (!verdict.ok) error(verdict.status, verdict.reason);
	const body = (await event.request.json().catch(() => null)) as { ids?: unknown } | null;
	const ids = body?.ids;
	if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) error(400, 'ids must list every folder');
	const result = await event.locals.services.reorderDomains.execute(ids, workspaceIdsOf(reach));
	if (!result.reordered) error(400, result.reason ?? 'The folders were not reordered');
	return json({ reordered: true, ids });
};
