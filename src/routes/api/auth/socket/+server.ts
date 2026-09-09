import { json } from '@sveltejs/kit';
import { authorizeSocket } from '$lib/server/socket-access.server';
import type { RequestHandler } from './$types';

/** The production upgrade proxy consults this through the normal HTTP auth hook. */
export const GET: RequestHandler = async (event) => {
	const upstreamPath = await authorizeSocket(event, event.url.searchParams.get('path') ?? '');
	return json({ upstreamPath }, { headers: { 'cache-control': 'no-store' } });
};
