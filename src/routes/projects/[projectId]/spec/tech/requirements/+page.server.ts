import { projectSyncKey } from '$lib/shared/section-sync';
import { readRequirements } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** Where it must run, languages, security, compliance, accessibility, and the technical constraints. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return await readRequirements(locals.services, params.projectId);
};
