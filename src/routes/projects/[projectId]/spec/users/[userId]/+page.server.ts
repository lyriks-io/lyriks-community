import { error } from '@sveltejs/kit';
import { projectSyncKey } from '$lib/shared/section-sync';
import { readFeaturePage, readUsersPage } from '$lib/server/spec360-read.server';
import type { PageServerLoad } from './$types';

/**
 * A user's page: who it is (criterion 4146848b) and what it can reach, level
 * by level (criterion 1ca9b3b4); where the spec still uses it guards its
 * delete. At the level of one action (&action=<id>, criterion 6dd2906e) it
 * also reads that action as its feature's page holds it: who may perform it
 * and the rules that decide it.
 */
export const load: PageServerLoad = async ({ params, url, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	const featureId = url.searchParams.get('feature');
	const actionId = url.searchParams.get('action');
	const [users, featurePage] = await Promise.all([
		readUsersPage(locals.services, params.projectId),
		featureId && actionId ? readFeaturePage(locals.services, params.projectId, featureId) : Promise.resolve(null)
	]);
	const user = users.users.find((u) => u.id === params.userId);
	if (!user) error(404, 'This user is not in the specification.');
	const view = featurePage?.kind === 'feature' ? featurePage.feature.actions.find((a) => a.id === actionId) : undefined;
	return { user, users, action: view && featureId ? { featureId, view } : null };
};
