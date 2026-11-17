import { redirect } from '@sveltejs/kit';
import { RETROSPEC_SECTION } from '$domain/retrospec';
import { PROJECT_HEALTH_SECTION, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readOverview } from '$lib/server/spec360-overview.server';
import type { PageServerLoad } from './$types';

/**
 * The Overview: the software in two minutes, read from every section, so any
 * authored change re-runs it; and where the decision on each point Lyriks
 * noticed stands, so a request opened or cancelled in Evolutions moves it. The
 * Reverse-Specifications of the product are the Reverse page's (criterion
 * 2dbed801): an older link that opened them over this page (`?retro`, from a
 * notification or a bookmark) lands there.
 */
export const load: PageServerLoad = async ({ params, depends, url, locals }) => {
	if (url.searchParams.has('retro')) redirect(303, `/projects/${encodeURIComponent(params.projectId)}/retrospec`);
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'evolution'));
	depends(sectionSyncKey(params.projectId, RETROSPEC_SECTION));
	// A new reading of the health lands here alone (criterion 5785c1fb), not through every layout.
	depends(sectionSyncKey(params.projectId, PROJECT_HEALTH_SECTION));
	return readOverview(locals.services, params.projectId);
};
