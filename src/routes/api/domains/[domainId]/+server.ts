import { error, json } from '@sveltejs/kit';
import type { Domain } from '$domain/portfolio';
import { callerReach } from '$lib/server/domain-scope.server';
import { folderChange } from '$application/portfolio/folder-policy';
import type { RequestHandler } from './$types';

/**
 * The folder acted on, once the caller may change it: a folder of another
 * workspace or outside their folders reads as absent (rules f019e036,
 * 26a92163), and a viewer of its workspace is refused (rules e2a7dc48, 2ceaa1cb).
 */
async function changeableDomain(event: Parameters<RequestHandler>[0]): Promise<Domain | undefined> {
	const existing = (await event.locals.services.listDomains.execute()).find(
		(domain) => domain.id === event.params.domainId
	);
	// A folder that is gone answers as it always did: PATCH 404, DELETE a no-op.
	if (!existing) return undefined;
	const verdict = folderChange(await callerReach(event), existing);
	if (!verdict.ok) error(verdict.status, verdict.reason);
	return existing;
}

export const PATCH: RequestHandler = async (event) => {
	const existing = await changeableDomain(event);
	if (!existing) error(404, 'Domain not found');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body is required');
	const result = await event.locals.services.updateDomain.execute(
		existing.id,
		typeof body.name === 'string' ? body.name : existing.name,
		typeof body.description === 'string' ? body.description : existing.description,
		typeof body.icon === 'string' ? body.icon : existing.icon
	);
	if (!result.updated) error(400, result.reason ?? 'Domain update failed');
	return json({ updated: true, domainId: existing.id });
};

export const DELETE: RequestHandler = async (event) => {
	await changeableDomain(event);
	const result = await event.locals.services.removeDomain.execute(event.params.domainId);
	if (!result.removed) error(409, result.reason ?? 'Domain removal failed');
	return json({ removed: true, domainId: event.params.domainId });
};
