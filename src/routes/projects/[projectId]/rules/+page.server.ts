import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Rules & edge cases has been folded into the Features capability as its "Rules"
 * tab. This route is kept only so old deep-links, the header user-menu and
 * Control Center "Fix now" targets still resolve — it redirects to the merged tab.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	// Forward deep-link params (anchor `node=`, sub-tab `rtab=`) but pin `tab=rules`.
	const qs = new URLSearchParams(url.searchParams);
	qs.set('tab', 'rules');
	redirect(308, `/projects/${params.projectId}/features?${qs.toString()}`);
};
