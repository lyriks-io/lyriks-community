import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Evolution has been folded into the Features capability as its "Evolution"
 * tab: a change request is read beside the feature tree it changes, not on a
 * page of its own. This route is kept only so old deep-links (a board link, a
 * request shared in a thread, a Control Center "Fix now") still resolve, and it
 * carries `request` / `view` over to the merged tab.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const target = new URL(`/projects/${params.projectId}/features`, url);
	target.searchParams.set('tab', 'evolution');
	for (const key of ['request', 'view']) {
		const value = url.searchParams.get(key);
		if (value !== null) target.searchParams.set(key, value);
	}
	redirect(308, `${target.pathname}${target.search}`);
};
