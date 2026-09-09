import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Dead-end route — the project list lives on the home dashboard. */
export const load: PageServerLoad = () => {
	throw redirect(307, '/');
};
