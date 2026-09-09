import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Backward-compatible redirect; Foundation is the only public capability. */
export const load: PageServerLoad = async ({ params, url }) => {
	redirect(308, `/projects/${params.projectId}/foundation${url.search}`);
};
