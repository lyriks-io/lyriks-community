import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { SESSION_COOKIE } from '$lib/server/session-cookie.server';
import type { RequestHandler } from './$types';

/**
 * MCP introspection uses the same live identity and role checks as browser access.
 * 401 and 403 are verdicts the gateway acts on: it ends the client's sign-in. An
 * account service that could not answer is no verdict, so it is a 503: the gateway
 * then keeps the client's tokens and the client retries, instead of discarding
 * them and opening a browser window.
 */
export const GET: RequestHandler = async (event) => {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) error(401, 'unauthenticated');
	const services = getServices();
	const account = await services.identity.verify(token);
	if (account === 'unreachable') error(503, 'identity unavailable');
	if (!account) error(401, 'unauthenticated');
	const role = await services.roleGate.verdict(token, 'mcp', null);
	if (role === 'unreachable') error(503, 'role check unavailable');
	if (role !== 'allowed') error(403, 'forbidden');
	return json({ id: account.id }, { headers: { 'cache-control': 'no-store' } });
};
