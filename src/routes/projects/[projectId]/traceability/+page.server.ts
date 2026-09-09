import { getServices } from '$composition/container.server';
import {
	summarizeBehavior,
	EMPTY_BEHAVIOR_TOTALS,
	type BehaviorOverview
} from '$application/summarize-behavior';
import { buildTraceability } from '$application/build-traceability';
import { coherenceScoreOf } from '$domain/coherence/incoherence';
import { leafFeatures } from '$domain/features';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

const EMPTY_OVERVIEW: BehaviorOverview = {
	hasProject: false,
	features: [],
	shared: [],
	totals: { ...EMPTY_BEHAVIOR_TOTALS },
	attention: { unauthored: 0, overCap: 0 }
};

/**
 * Traceability hosts three tabs: the read-only coverage matrix (Coverage),
 * Baselines and Approvals — the last two folded in from their own retired
 * capabilities (matching the prototype's information architecture). This loader
 * hydrates all three: the matrix joins the Features draft to the behavior
 * overview, while Baselines/Approvals carry their own editable residue drafts.
 * Fail-soft on the behavior read so the matrix still renders from the draft alone.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change. The behavior overview and
	// coherence analysis are cross-section, hence the project-wide key.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'features'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'baselines'));
	depends(sectionSyncKey(params.projectId, 'approvals'));
	depends(sectionSyncKey(params.projectId, 'documents'));
	const services = getServices();
	const behaviorPort = services.behaviorPort;

	const overview = await (async (): Promise<BehaviorOverview> => {
		try {
			const project = await behaviorPort.readProject(params.projectId);
			const featureIds = project?.project.featureIds ?? [];
			const snapshots = await Promise.all(
				featureIds.map(async (featureId) => ({
					featureId,
					snapshot: await behaviorPort.readFeature(params.projectId, featureId).catch(() => null)
				}))
			);
			return summarizeBehavior(project, snapshots, services.maturityScorer);
		} catch (err) {
			console.warn('[traceability] behavior overview unavailable:', err);
			return EMPTY_OVERVIEW;
		}
	})();

	const [
		features,
		initDraft,
		coherence,
		baselinesDraft,
		baselinesRevision,
		approvalsDraft,
		approvalsRevision,
		documentsDraft
	] = await Promise.all([
		services.loadFeaturesDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.loadCoherenceDraft.execute(params.projectId),
		services.loadBaselinesDraft.execute(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'baselines'),
		services.loadApprovalsDraft.execute(params.projectId),
		services.sectionDocuments.currentRevision(params.projectId, 'approvals'),
		services.loadDocumentRegister.execute(params.projectId)
	]);

	const session = services.currentSession();

	return {
		traceability: buildTraceability(features, overview, documentsDraft.sources),
		productName: initDraft.productName.trim() || 'Untitled project',
		session,
		baselines: {
			draft: baselinesDraft,
			revision: baselinesRevision,
			// The CURRENT scores/count to diff every saved baseline against.
			current: {
				readiness: coherence.analysis.readinessScore,
				coherence: coherenceScoreOf(coherence.analysis.gaps),
				featureCount: leafFeatures(features).length
			}
		},
		approvals: {
			draft: approvalsDraft,
			revision: approvalsRevision
		}
	};
};
