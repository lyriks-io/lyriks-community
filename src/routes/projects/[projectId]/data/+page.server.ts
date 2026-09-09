import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Legacy route — Data & flows folded into Infrastructure & Data. Deep-link
 *  params (`?node=` anchors from the graph/search) survive the hop. */
export const load: PageServerLoad = ({ params, url }) => {
	throw redirect(307, `/projects/${params.projectId}/infrastructure${url.search}`);
};
