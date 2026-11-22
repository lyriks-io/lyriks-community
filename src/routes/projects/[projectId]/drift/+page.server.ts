import { RETROSPEC_SECTION } from '$domain/retrospec';
import { EVOLUTION_SECTION, projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readActionHistory } from '$lib/server/action-history.server';
import { readDriftPage } from '$lib/server/code-drift-page.server';
import { retrospecLiveKey } from '$ui/retrospec/live-key';
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
	// A sync of the code, an edit of the spec: any of them changes what drifts.
	depends(projectSyncKey(params.projectId));
	// The code branches the requests reported, read from the Evolution document, which no project-wide load reads.
	depends(sectionSyncKey(params.projectId, EVOLUTION_SECTION));
	// The AI's calls on the run under way, which its preview follows without a section moving (criterion 63d6ffe7).
	depends(retrospecLiveKey(params.projectId));
	const [drift, history] = await Promise.all([readDriftPage(locals.services, params.projectId), readActionHistory(event, params.projectId)]);
	return { drift, history };
};
