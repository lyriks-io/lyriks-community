import { projectSyncKey } from '$lib/shared/section-sync';
import { readFeatureList } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** Every core feature with its features and what each lets a user do. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return { list: await readFeatureList(locals.services, params.projectId) };
};
