import { error, json } from '@sveltejs/kit';
import { callerReach } from '$lib/server/domain-scope.server';
import { folderCreation, foldersVisibleTo } from '$application/portfolio/folder-policy';
import type { RequestHandler } from './$types';

/** The folders the caller lists (action a34fe7c0): those of their workspaces, in their reach there. */
export const GET: RequestHandler = async (event) => {
	const domains = await event.locals.services.listDomains.execute();
	return json({ domains: foldersVisibleTo(await callerReach(event), domains) });
};

/**
 * Add a folder (action f31accb5) to the workspace the switcher shows: refused
 * to a member limited to some folders (rule 509fa7a1) and to a viewer (rule cfc8ad95).
 */
export const POST: RequestHandler = async (event) => {
	const verdict = folderCreation(await callerReach(event));
	if (!verdict.ok) error(verdict.status, verdict.reason);
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name) error(400, 'name is required');
	const domain = await event.locals.services.createDomain.execute(
		name,
		typeof body?.description === 'string' ? body.description : '',
		typeof body?.icon === 'string' ? body.icon : '',
		verdict.workspaceId ?? null
	);
	return json({ domain }, { status: 201 });
};
