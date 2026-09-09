import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import type { RequestHandler } from './$types';

/** MCP introspection uses the same live identity and role checks as browser access. */
export const GET: RequestHandler = async (event) => {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) error(401, 'unauthenticated');
	const services = getServices();
	const account = await services.identity.verify(token);
	if (!account || account === 'unreachable') error(401, 'unauthenticated');
	if (!(await services.roleGate.allows(token, 'mcp', null))) error(403, 'forbidden');
	return json({ id: account.id }, { headers: { 'cache-control': 'no-store' } });
};
