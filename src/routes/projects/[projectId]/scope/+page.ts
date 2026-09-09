import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Scope coverage has no page. The ledger it used to edit is reasoning the
 * modelling agent is forced through before authoring — a human filling it in was
 * self-certifying the completion gate — and the gate itself is still driven
 * through the MCP (`audit_project_scope`, `finish_project`) and the JSON API.
 * Nothing about it is surfaced in the product for now, so stored deep links land
 * on Foundation rather than 404.
 */
export const load: PageLoad = ({ params }) => {
	redirect(308, `/projects/${params.projectId}/foundation`);
};
