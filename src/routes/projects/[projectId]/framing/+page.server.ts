import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Framing no longer exists as a capability of its own: its Business / Market /
 * Technical / Security sections are tabs of Foundation (`/foundation`), and
 * the word is gone from every surface a user can read. This route survives only
 * so old bookmarks and stored "Fix now" targets keep resolving — the browser
 * re-applies the original `#anchor` to a redirect target that carries none.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/projects/${params.projectId}/foundation?tab=business`);
};
