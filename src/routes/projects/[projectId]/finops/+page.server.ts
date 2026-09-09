import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The AI Cost Governor lives inside Supervision as its "AI Gateway" tab, and is
 * withdrawn along with it. This route used to redirect old deep-links to that tab;
 * since the tab is no longer reachable, a redirect would only hand the caller a
 * 404 one hop later, so it answers 404 directly. The FinOps draft and the LiteLLM
 * endpoints under `/api/finops` are unchanged.
 */
export const load: PageServerLoad = async () => {
	error(404, 'Not found');
};
