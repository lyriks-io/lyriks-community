import { redirect } from '@sveltejs/kit';
import { legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34). Infrastructure & Data is Technology & data of Knowledge now: its data map, its requirements, its stack in Architecture.
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(308, legacyPageTarget(params.projectId, 'infrastructure', url.searchParams));
};
