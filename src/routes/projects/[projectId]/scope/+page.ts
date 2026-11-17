import { redirect } from '@sveltejs/kit';
import { legacyPageTarget } from '$ui/spec360/legacy-addresses';
import type { PageLoad } from './$types';

/**
 * Scope coverage has no page: the ledger is reasoning the modelling agent is
 * forced through before authoring, and the gate is driven through the MCP
 * (`audit_project_scope`, `finish_project`) and the JSON API. A stored deep
 * link opens the Overview of Knowledge (criterion 84162c34).
 */
export const load: PageLoad = ({ params, url }) => {
	redirect(308, legacyPageTarget(params.projectId, 'scope', url.searchParams));
};
