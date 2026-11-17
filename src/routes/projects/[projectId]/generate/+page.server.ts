import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * The spec generator: its guarantee tiers, its threshold and the generation
 * itself, on the persisted coherence draft and the live analysis it gates on.
 * It used to sit under the readings of the old health page, which no longer
 * exists (criterion 799e1f5b): no score is drawn here.
 */
export const load: PageServerLoad = async ({ params, depends, locals }) => {
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'coherence'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	const services = locals.services;
	const [view, identity, revision] = await Promise.all([
		services.loadCoherenceDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'coherence')
	]);
	return {
		draft: view.draft,
		analysis: view.analysis,
		productName: identity.productName.trim() || 'Untitled project',
		session: services.currentSession(),
		tier: services.currentTier(),
		revision
	};
};
