import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** A bare project URL opens on Foundation — where the product is defined. */
export const load: PageServerLoad = ({ params }) => {
	throw redirect(307, `/projects/${params.projectId}/foundation`);
};
