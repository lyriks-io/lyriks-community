import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The Functional behavior overview has been folded into the Features capability
 * as its "Behavior" tab. This route is kept only so old deep-links and Control
 * Center "Fix now" targets still resolve — it redirects to the merged tab.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/projects/${params.projectId}/features?tab=behavior`);
};
