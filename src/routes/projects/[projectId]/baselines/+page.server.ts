import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Baselines has been merged into the Traceability capability as its "Baselines"
 * tab (matching the prototype's information architecture). This route is kept
 * only so old deep-links and Control Center "Fix now" targets still resolve — it
 * redirects to the merged page with the baselines tab pre-selected. The baselines
 * draft + /api/.../baselines endpoints are unchanged; it is now rendered inside
 * Traceability.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/projects/${params.projectId}/traceability?tab=baselines`);
};
