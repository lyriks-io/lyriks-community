import { projectSyncKey } from '$lib/shared/section-sync';
import { readUsersPage } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** Who can do what on its own page (criterion 5787390d): every user against every action, derived from the features, hence the project key. */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return { users: await readUsersPage(locals.services, params.projectId) };
};
