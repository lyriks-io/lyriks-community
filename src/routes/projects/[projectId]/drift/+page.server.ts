import { RETROSPEC_SECTION } from '$domain/retrospec';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readActionHistory } from '$lib/server/action-history.server';
import { readDriftPage } from '$lib/server/code-drift-page.server';
import type { PageServerLoad } from './$types';

/**
 * Code drift (criterion 4e7ec88c): the changes found in the code outside the
 * Specification 360° and the evolutions, once the spec is validated. The
 * project layout already gates the reader's access.
 */
export const load: PageServerLoad = async (event) => {
	const { params, depends, locals } = event;
	// A decision moves the review document, an acceptance the versions.
	depends(sectionSyncKey(params.projectId, RETROSPEC_SECTION));
	depends(sectionSyncKey(params.projectId, 'baselines'));
	// A sync of the code, an evolution, an edit of the spec: any of them changes what drifts.
	depends(projectSyncKey(params.projectId));
	const [drift, history] = await Promise.all([readDriftPage(locals.services, params.projectId), readActionHistory(event, params.projectId)]);
	return { drift, history };
};
