import { error, json } from '@sveltejs/kit';
import { parseFeedQuery } from '$domain/activity';
import { readHomeFeedPage } from '$lib/server/home.server';
import type { RequestHandler } from './$types';

/** The next cards of Home's feed, as the reader scrolls (feat-home, action c7f50ac5). */
export const GET: RequestHandler = async (event) => {
	if (event.locals.authRequired && !event.locals.session?.isAuthenticated) error(401, 'unauthenticated');
	const query = parseFeedQuery(event.url.searchParams);
	if (!query) error(400, 'The page of the feed asked for cannot be read.');
	return json(await readHomeFeedPage(event, query));
};
