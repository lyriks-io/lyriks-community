import { json } from '@sveltejs/kit';
import { loadAppChrome } from '$lib/server/app-chrome-data.server';
import type { RequestHandler } from './$types';

/** What the app bar shows beyond the session, for the signed-in reader (see AppChrome). */
export const GET: RequestHandler = async (event) => {
	const project = event.url.searchParams.get('project');
	return json(await loadAppChrome(event, project));
};
