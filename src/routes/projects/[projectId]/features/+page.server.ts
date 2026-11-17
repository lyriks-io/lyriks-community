import { redirect } from '@sveltejs/kit';
import { locateInOutline, specOutline } from '$application/spec360/outline';
import { legacyFeatureId, legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34): Features is a chapter of Knowledge now, and a link that
 * named a feature or a core feature opens its page when the specification
 * still holds it. Its Roadmap and Evolution tabs became Changes.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const id = legacyFeatureId(url.searchParams);
	const known = id ? locateInOutline(specOutline(await locals.services.loadFeaturesDraft.execute(params.projectId)), id) !== null : false;
	redirect(308, legacyPageTarget(params.projectId, 'features', url.searchParams, known));
};
