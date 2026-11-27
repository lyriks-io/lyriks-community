import { redirect } from '@sveltejs/kit';
import { legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34). Traceability is retired: its Approvals tab opens What
 * this spec covers on the Overview, its Baselines tab the Overview, its
 * coverage matrix the Features of Knowledge (rules b995ffb1, 20f14192,
 * 8bc8522a).
 */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(308, legacyPageTarget(params.projectId, 'traceability', url.searchParams));
};
