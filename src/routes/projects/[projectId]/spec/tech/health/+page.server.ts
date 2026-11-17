import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The view this address named reads Operations now: bookmarks and stored links still open it (criterion 84162c34). */
export const load: PageServerLoad = ({ params, url }) => {
	redirect(308, `/projects/${encodeURIComponent(params.projectId)}/spec/tech/operations${url.search}`);
};
