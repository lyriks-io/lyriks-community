import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Tech and data opens on its first tab, the data map. */
export const load: PageServerLoad = ({ params }) => {
	redirect(307, `/projects/${encodeURIComponent(params.projectId)}/spec/tech/data-map`);
};
