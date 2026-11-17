import { projectSyncKey } from '$lib/shared/section-sync';
import { readGlossary } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** The governed vocabulary, counted against the whole spec, so any authored change re-runs it. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return await readGlossary(locals.services, params.projectId);
};
