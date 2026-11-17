import { error, json } from '@sveltejs/kit';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import type { RequestHandler } from './$types';

/** The refusal of rule 8f68eccd, as the projects panel shows it. */
const SCOPED_REFUSAL = 'Only members who see every folder can change their order';

/**
 * Put the folders of the projects in a new order (action 5ccc378f): the body
 * is `{ ids }`, every domain from top to bottom. The order is the same for
 * everyone, so a member who sees only some folders is refused (rule 8f68eccd),
 * the way creating a domain is (rule 352b6332); a list that is not the folders
 * as they stand is refused too (rule a20195a8).
 */
export const PUT: RequestHandler = async (event) => {
	if ((await callerAllowedDomains(event)) !== null) error(403, SCOPED_REFUSAL);
	const body = (await event.request.json().catch(() => null)) as { ids?: unknown } | null;
	const ids = body?.ids;
	if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) error(400, 'ids must list every folder');
	const result = await event.locals.services.reorderDomains.execute(ids);
	if (!result.reordered) error(400, result.reason ?? 'The folders were not reordered');
	return json({ reordered: true, ids });
};
