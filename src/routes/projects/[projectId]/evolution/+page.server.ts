import type { AppServices } from '$composition/container.server';
import { sectionSyncKey } from '$lib/shared/section-sync';
import { loadEvolutionTab } from '$lib/server/evolution-tab.server';
import { industryLabelOf } from '$domain/foundation';
import { adminNamesOf } from '$application/spec360/users';
import { isCommunity } from '$domain/licensing';
import type { PageServerLoad } from './$types';

/**
 * The Evolution page, a capability of its own in the left navigation: the
 * board of change requests, and one request's reading when `?request=` names it.
 */
export const load: PageServerLoad = async ({ params, url, depends, cookies, locals }) => {
	// Live-sync: a dossier write, or a source it cites, re-runs this load.
	depends(sectionSyncKey(params.projectId, 'evolution'));
	depends(sectionSyncKey(params.projectId, 'documents'));
	// The admin roles mark the people of the request's diagrams (ac-evo-func-uml).
	depends(sectionSyncKey(params.projectId, 'users'));
	const services = locals.services;
	// Evolutions are not part of Community (EVO-001): the page names the plan that opens them and reads nothing of them.
	if (isCommunity(services.installEdition())) return { locked: true as const, adminNames: [] as string[], ...(await headingOf(services, params.projectId)) };
	const [evolution, identity, users] = await Promise.all([
		loadEvolutionTab(services, params.projectId, url, cookies),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.loadUsersDraft.execute(params.projectId)
	]);
	return {
		locked: false as const,
		evolution,
		adminNames: adminNamesOf(users?.roles ?? []),
		productName: identity.productName.trim() || 'Untitled project',
		industryLabel: industryLabelOf(identity.industry)
	};
};

async function headingOf(services: AppServices, projectId: string) {
	const identity = await services.loadFoundationDraft.loadIdentity(projectId);
	return { productName: identity.productName.trim() || 'Untitled project' };
}
