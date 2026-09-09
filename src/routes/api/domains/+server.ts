import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { callerAllowedDomains } from '$lib/server/domain-scope.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const allowed = await callerAllowedDomains(event);
	const domains = await getServices().listDomains.execute();
	return json({
		domains: allowed === null ? domains : domains.filter((domain) => allowed.has(domain.id))
	});
};

export const POST: RequestHandler = async (event) => {
	if ((await callerAllowedDomains(event)) !== null) {
		error(403, 'Only members with full portfolio access can create domains');
	}
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name) error(400, 'name is required');
	const domain = await getServices().createDomain.execute(
		name,
		typeof body?.description === 'string' ? body.description : '',
		typeof body?.icon === 'string' ? body.icon : ''
	);
	return json({ domain }, { status: 201 });
};
