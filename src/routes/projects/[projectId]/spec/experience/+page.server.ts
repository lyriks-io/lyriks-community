import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import { readExperiencePage } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** Experience: the visual identity, the key journeys and the reusable components. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'experience'));
	const { view, draft, revision } = await readExperiencePage(locals.services, params.projectId);
	return { view, draft, revision, session: locals.services.currentSession() };
};
