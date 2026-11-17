import { RETROSPEC_SECTION } from '$domain/retrospec';
import { PROJECT_HEALTH_SECTION, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readNoticed } from '$lib/server/spec360-overview.server';
import type { PageServerLoad } from './$types';

/**
 * What Lyriks noticed, on a page of its own (criterion 55a7fe86): every point
 * the project health is computed from and what the retrospecification
 * noticed, each with where its decision stands, so a request opened or
 * cancelled in Evolutions moves it; read again on any authored change.
 */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'evolution'));
	depends(sectionSyncKey(params.projectId, RETROSPEC_SECTION));
	// A new reading of Project health lands in place.
	depends(sectionSyncKey(params.projectId, PROJECT_HEALTH_SECTION));
	return readNoticed(locals.services, params.projectId);
};
