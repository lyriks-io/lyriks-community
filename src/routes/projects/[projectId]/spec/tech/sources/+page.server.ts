import { projectSyncKey } from '$lib/shared/section-sync';
import { readSpecSources } from '$lib/server/spec360-sources.server';
import type { PageServerLoad } from './$types';

/** The blocks that cite each source (criterion b0ea9889): this page alone shows them, so no other page carries them. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	const { citedBy } = await readSpecSources(locals.services, params.projectId);
	return { citedBy };
};
