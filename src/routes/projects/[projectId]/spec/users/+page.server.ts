import { projectSyncKey } from '$lib/shared/section-sync';
import { readUsersPage } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/** Users and permissions: the personas and who can do each action (derived from features and screens, hence the project key). */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	return { users: await readUsersPage(locals.services, params.projectId) };
};
