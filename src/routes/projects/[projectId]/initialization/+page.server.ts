import { redirect } from '@sveltejs/kit';
import { legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34). Initialization became Foundation, which is the Overview of Knowledge now.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(308, legacyPageTarget(params.projectId, 'initialization', url.searchParams));
};
