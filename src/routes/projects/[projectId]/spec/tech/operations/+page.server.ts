import { IMPLEMENTATION_COVERAGE_SECTION, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readOperations } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** What the spec says about running the product, and how much of it the code holds. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	// The implementation coverage refreshes in the background and says so on its own key.
	depends(sectionSyncKey(params.projectId, IMPLEMENTATION_COVERAGE_SECTION));
	return await readOperations(locals.services, params.projectId);
};
