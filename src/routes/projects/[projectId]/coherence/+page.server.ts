import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * There is no Control Center and no page of scores any more (criteria
 * ef42a85d, 799e1f5b): every stored link to the old health page opens What
 * Lyriks noticed, a page of its own in the Specification 360° (criterion
 * 55a7fe86). The spec generator it used to host lives at /generate.
 */
export const load: PageServerLoad = ({ params }) => {
	redirect(307, `/projects/${encodeURIComponent(params.projectId)}/spec/noticed`);
};
