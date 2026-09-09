import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import {
	summarizeBehavior,
	EMPTY_BEHAVIOR_TOTALS,
	type BehaviorOverview
} from '$application/summarize-behavior';
import { indexFeatureActions, type FeatureActionIndex } from '$application/index-feature-actions';
import { indexFeatureRules, type KernelRulesReadModel } from '$application/index-feature-rules';
import {
	FEATURE_ADVICE_SECTION,
	IMPLEMENTATION_COVERAGE_SECTION,
	projectSyncKey,
	sectionSyncKey
} from '$lib/shared/section-sync';
import type { PageServerLoad } from './$types';

const EMPTY_OVERVIEW: BehaviorOverview = {
	hasProject: false,
	features: [],
	shared: [],
	totals: { ...EMPTY_BEHAVIOR_TOTALS },
	attention: { unauthored: 0, overCap: 0 }
};

const EMPTY_KERNEL_RULES: KernelRulesReadModel = { groups: [], total: 0, missingDescription: 0 };

/**
 * Read-only behavior read models folded from the canonical kernel, in ONE pass
 * over the snapshots: the overview (was the Functional page) and the per-feature
 * action list the tree shows under each leaf.
 */
async function readBehavior(projectId: string): Promise<{
	overview: BehaviorOverview;
	actions: FeatureActionIndex;
	kernelRules: KernelRulesReadModel;
}> {
	const services = getServices();
	const behavior = services.behaviorPort;
	try {
		const project = await behavior.readProject(projectId);
		const featureIds = project?.project.featureIds ?? [];
		const featureSnapshots = await Promise.all(
			featureIds.map(async (featureId) => ({
				featureId,
				snapshot: await behavior.readFeature(projectId, featureId).catch(() => null)
			}))
		);
		return {
			overview: summarizeBehavior(project, featureSnapshots, services.maturityScorer),
			actions: indexFeatureActions(featureSnapshots),
			kernelRules: indexFeatureRules(project, featureSnapshots)
		};
	} catch (err) {
		console.warn('[features] behavior unavailable:', err);
		return { overview: EMPTY_OVERVIEW, actions: {}, kernelRules: EMPTY_KERNEL_RULES };
	}
}

/**
 * Server-side load: hydrate the features draft + Step 01 identity, plus the two
 * capabilities folded in as tabs — the read-only Behavior overview (was
 * Functional) and the editable Rules & edge cases draft.
 */
export const load: PageServerLoad = async ({ params, depends }) => {
	// Live-sync: re-run when these sections change.
	depends(projectSyncKey(params.projectId));
	depends(sectionSyncKey(params.projectId, 'features'));
	depends(sectionSyncKey(params.projectId, 'rules'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	// The badge tiers publish these when a background refresh lands; the client
	// invalidates them alone, so only this load re-runs, not the project chrome.
	depends(sectionSyncKey(params.projectId, FEATURE_ADVICE_SECTION));
	depends(sectionSyncKey(params.projectId, IMPLEMENTATION_COVERAGE_SECTION));
	const services = getServices();
	// Deliberately NOT the coherence analysis: the project layout already runs it
	// for the rail rings, and that analysis fans out a read of every section at
	// once. Running it a second time here doubled the concurrent database work of
	// the heaviest page in the product, for a readiness score no component ever
	// read. When the pool ran out under concurrent MCP writes, the acquisition
	// timed out, and an uncaught throw turned the whole page into a 500 until
	// connections freed up again.
	const [
		draft,
		rulesDraft,
		initDraft,
		revision,
		rulesRevision,
		behavior,
		advice,
		implementation
	] = await Promise.all([
		services.loadFeaturesDraft.execute(params.projectId),
		services.loadRulesDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.draftLock.current(params.projectId, 'features'),
		services.draftLock.current(params.projectId, 'rules'),
		readBehavior(params.projectId),
		// Instant read from the maturity-score cache — the heavy per-leaf engine
		// scoring runs in the background and pushes over live-sync (features-advice)
		// so the badges fill in without blocking this load.
		services.featureAdvice.get(params.projectId),
		// Code-implementation coverage, served like `advice`: an instant snapshot
		// from the cache. The per-leaf engine reads (serialized on the shared stdio
		// subprocess, tens of seconds on an adopted project) run in the background,
		// and a `features-implementation` change re-runs this load when they land,
		// so the chips fill in live instead of blocking the page.
		services.implementationCoverage.get(params.projectId)
	]);
	const session = services.currentSession();
	const behaviorWorkspaceRoot = services.behaviorWorkspaceRoot();
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel = industryLabelOf(initDraft.industry);
	return {
		draft,
		rulesDraft,
		rulesRevision,
		overview: behavior.overview,
		featureActions: behavior.actions,
		kernelRules: behavior.kernelRules,
		advisorAvailable: services.advisorAvailable(),
		advice,
		implementation,
		session,
		behaviorWorkspaceRoot,
		productName,
		industryLabel,
		revision
	};
};
