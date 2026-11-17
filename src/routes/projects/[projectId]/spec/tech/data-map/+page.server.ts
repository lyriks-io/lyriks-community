import { projectSyncKey } from '$lib/shared/section-sync';
import { readDataMap } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** The data map and the facts the spec writes about the data. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	// A table moved re-reads the placements alone (+page.ts), never this whole map.
	depends(projectSyncKey(params.projectId));
	return await readDataMap(locals.services, params.projectId);
};
