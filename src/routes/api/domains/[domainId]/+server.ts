import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import type { RequestHandler } from './$types';

async function requireDomainAccess(event: Parameters<RequestHandler>[0]): Promise<void> {
	const allowed = await callerAllowedDomains(event);
	if (allowed !== null && !allowed.has(event.params.domainId)) error(404, 'Domain not found');
}

export const PATCH: RequestHandler = async (event) => {
	await requireDomainAccess(event);
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body is required');
	const services = getServices();
	const existing = (await services.listDomains.execute()).find(
		(domain) => domain.id === event.params.domainId
	);
	if (!existing) error(404, 'Domain not found');
	const result = await services.updateDomain.execute(
		existing.id,
		typeof body.name === 'string' ? body.name : existing.name,
		typeof body.description === 'string' ? body.description : existing.description,
		typeof body.icon === 'string' ? body.icon : existing.icon
	);
	if (!result.updated) error(400, result.reason ?? 'Domain update failed');
	return json({ updated: true, domainId: existing.id });
};

export const DELETE: RequestHandler = async (event) => {
	await requireDomainAccess(event);
	const result = await getServices().removeDomain.execute(event.params.domainId);
	if (!result.removed) error(409, result.reason ?? 'Domain removal failed');
	return json({ removed: true, domainId: event.params.domainId });
};
