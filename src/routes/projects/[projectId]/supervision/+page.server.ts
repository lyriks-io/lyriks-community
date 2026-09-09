import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { buildFeatureWorkView } from '$application/build-feature-work-view';
import { industryLabelOf } from '$domain/foundation';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import type { FinopsSignals } from '$domain/finops';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

/**
 * Supervision is WITHDRAWN from the product: it has no left-nav entry, no sidebar
 * footer card and no `route` on its capability, so nothing in the app links here —
 * and this gate closes the last way in, a stored bookmark or a typed URL.
 *
 * Nothing is deleted. The page component, the store, the section views, the
 * Supervision draft, `/api/draft/supervision` and the MCP `supervision` section all
 * stay exactly as they were, so the capability keeps being authorable out of process
 * and comes back by flipping this one flag (plus restoring the capability's `route`).
 * Typed `boolean` rather than left as a literal so the loader below still
 * type-checks as reachable code.
 */
const WITHDRAWN: boolean = true;

/**
 * Server-side load: hydrate Supervision with the persisted board, the Step 01
 * identity for the chrome, AND the AI Cost Governor state — because the LiteLLM
 * governor now lives inside Supervision as its "AI Gateway" tab. The governor
 * reads the SAME live signals the standalone page did (Spec-Readiness + deep
 * coherence + blocking gaps), so folding it in changes nothing about how it gates.
 */
export const load: PageServerLoad = async ({ params, depends, parent }) => {
	if (WITHDRAWN) error(404, 'Not found');

	// Live-sync: re-run when these sections change.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'supervision'));
	depends(sectionSyncKey(params.projectId, 'finops'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'features'));
	const services = getServices();
	const [draft, finopsDraft, initDraft, coherence, featuresDraft, revision, finopsRevision] =
		await Promise.all([
			services.loadSupervisionDraft.execute(params.projectId),
			services.loadFinopsDraft.execute(params.projectId),
			services.loadFoundationDraft.loadIdentity(params.projectId),
			services.loadCoherenceDraft.execute(params.projectId),
			services.loadFeaturesDraft.execute(params.projectId),
			services.sectionDocuments.currentRevision(params.projectId, 'supervision'),
			services.sectionDocuments.currentRevision(params.projectId, 'finops')
		]);

	// Read-only mirror of the Features work queue: the queue stays owned by the
	// Features section; Supervision only shows it so task tracking is one picture.
	const { team } = await parent();
	const featureWork = buildFeatureWorkView(featuresDraft, team.collaborators);

	// The SAME correctness formula the Control Center / Coherence page use, so the
	// number the governor gates on never drifts from the rest of the app.
	const signals: FinopsSignals = {
		readinessScore: coherence.analysis.readinessScore,
		coherenceScore: coherenceScoreOf(coherence.analysis.gaps),
		blockingGapCount: coherence.analysis.gaps.filter((g) => g.blocking).length
	};

	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	const session = services.currentSession();
	return {
		draft,
		finopsDraft,
		featureWork,
		signals,
		productName,
		industryLabel,
		session,
		specReadiness: coherence.analysis.readinessScore,
		gatewayConfigured: services.litellmGatewayAvailable(),
		gatewayBaseUrl: services.litellmGatewayBaseUrl(),
		revision,
		finopsRevision
	};
};
