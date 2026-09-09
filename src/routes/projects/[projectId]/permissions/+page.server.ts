import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Permissions has been merged into the Users & Permissions capability as its
 * "Access matrix" tab (matching the prototype). This route is kept only so old
 * deep-links and Control Center "Fix now" targets still resolve — it redirects
 * to the merged page with the matrix tab pre-selected.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/projects/${params.projectId}/users?tab=permissions`);
};
