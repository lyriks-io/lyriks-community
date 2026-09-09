import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Server-side load: hydrate Step 09 with the persisted authored state + the
 * live coherence analysis (dimensions/gaps/readiness aggregated from steps
 * 01-08) plus the Step 01 identity for the chrome.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'coherence'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	const services = getServices();
	const [view, initDraft, revision, featureMaturity] = await Promise.all([
		services.loadCoherenceDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'coherence'),
		// Per-feature maturity for the Behavior Maturity reading. Fail-soft: the MAP
		// baseline page still renders coherence when the behavior read misbehaves.
		services.loadFeatureMaturity.execute(params.projectId).catch((err) => {
			console.warn('[coherence] feature maturity unavailable, omitting maturity detail:', err);
			return [];
		})
	]);
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	const session = services.currentSession();
	return {
		draft: view.draft,
		analysis: view.analysis,
		productName,
		industryLabel,
		session,
		specReadiness: view.analysis.readinessScore,
		featureMaturity,
		tier: services.currentTier(),
		revision
	};
};
