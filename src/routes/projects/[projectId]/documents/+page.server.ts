import { redirect } from '@sveltejs/kit';
import { legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34). Documents & Sources is the Sources view of Technology & data now; a link from a citation keeps its source and its way back.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(308, legacyPageTarget(params.projectId, 'documents', url.searchParams));
};
