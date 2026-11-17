import { projectSyncKey } from '$lib/shared/section-sync';
import { readArchitecture } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** The stack, layer by layer. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return await readArchitecture(locals.services, params.projectId);
};
