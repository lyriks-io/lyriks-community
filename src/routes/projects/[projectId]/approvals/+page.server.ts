import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Approvals has been merged into the Traceability capability as its "Approvals"
 * tab (matching the prototype's information architecture). This route is kept
 * only so old deep-links and Control Center "Fix now" targets still resolve — it
 * redirects to the merged page with the approvals tab pre-selected. The approvals
 * draft + /api/.../approvals endpoints are unchanged; it is now rendered inside
 * Traceability.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/projects/${params.projectId}/traceability?tab=approvals`);
};
