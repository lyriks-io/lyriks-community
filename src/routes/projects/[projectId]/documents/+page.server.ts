import { getServices } from '$composition/container.server';
import { sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Hydrate the Documents & Sources register.
 *
 * Through the SAME loader every citation control uses, so this page and the
 * pickers can never disagree: legacy architecture reference docs are folded in
 * here too, and editing anything persists them into the register for good.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change. Architecture matters because
	// its legacy reference docs are folded into the register.
	depends(sectionSyncKey(params.projectId, 'documents'));
	depends(sectionSyncKey(params.projectId, 'architecture'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	const services = getServices();
	const [draft, initDraft, revision] = await Promise.all([
		services.loadDocumentRegister.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'documents')
	]);
	const productName = initDraft.productName.trim() || 'Untitled project';
	const session = services.currentSession();
	return { draft, productName, session, revision };
};
