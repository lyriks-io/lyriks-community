import { redirect } from '@sveltejs/kit';
import { anchorDomId, anchorOf } from '$domain/discussions';
import type { PageServerLoad } from './$types';

/**
 * An old address kept so bookmarks and stored links still open something
 * (criterion 84162c34). An action has no page of its own any more: it reads on
 * its row of its feature's list (criterion 50809f1c).
 */
export const load: PageServerLoad = ({ params, url }) => {
	const feature = `/projects/${encodeURIComponent(params.projectId)}/spec/features/${encodeURIComponent(params.featureId)}`;
	redirect(308, `${feature}${url.search}#${anchorDomId(anchorOf('action', params.featureId, params.actionId))}`);
};
