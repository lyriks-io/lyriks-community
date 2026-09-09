import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Legacy route — the Reuse library tab is hidden, so land on Features itself. */
export const load: PageServerLoad = ({ params }) => {
	throw redirect(307, `/projects/${params.projectId}/features`);
};
