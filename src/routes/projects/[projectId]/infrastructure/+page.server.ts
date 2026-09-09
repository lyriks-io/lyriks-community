import { getServices } from '$composition/container.server';
import { industryLabelOf } from '$domain/foundation';
import { tierHasFormalDpo } from '$domain/tier/tier';
import { deriveDataVisibility } from '$application/data-visibility';
import {
	indexFeatureResources,
	EMPTY_KERNEL_RESOURCES,
	type KernelResourcesReadModel
} from '$application/index-feature-resources';
import { projectSyncKey, sectionSyncKey } from '$lib/shared/section-sync';
import type { ProjectDataDraft } from '$domain/data';
import type { PageServerLoad } from './$types';

/**
 * Reconcile the behavior kernel's resources against the infra map, for the
 * Architecture tab. Walks the same per-feature snapshots the Features page reads,
 * so a resource declared only in the behavior editor stops being invisible in
 * Lyriks. The data draft comes in so each row knows whether the map still holds it.
 *
 * Behavior being unavailable is never fatal here: this is one panel on one tab,
 * and the rest of Data & Architecture is authored entirely in Lyriks.
 */
async function readKernelResources(
	projectId: string,
	data: ProjectDataDraft
): Promise<KernelResourcesReadModel> {
	const behavior = getServices().behaviorPort;
	try {
		const project = await behavior.readProject(projectId);
		const featureIds = project?.project.featureIds ?? [];
		const featureSnapshots = await Promise.all(
			featureIds.map(async (featureId) => ({
				featureId,
				snapshot: await behavior.readFeature(projectId, featureId).catch(() => null)
			}))
		);
		return indexFeatureResources(project, featureSnapshots, data);
	} catch (err) {
		console.warn('[infrastructure] behavior unavailable:', err);
		return EMPTY_KERNEL_RESOURCES;
	}
}

/**
 * Infrastructure & Data — the data spine + where it runs. Hydrates the data
 * draft (its read-only derivedEntities already consolidated from Experience
 * inside the use case) plus the identity for the page header. (The domain /
 * store / repo / save endpoint stay named `data`; only the route + label moved.)
 *
 * The whole-project knowledge graph is a tab here (`?tab=graph`). It is derived
 * from EVERY context and expensive to build, so it is loaded only when that tab
 * is open, and then streamed: the route commits immediately and the tab shows a
 * skeleton until the graph resolves.
 */
export const load: PageServerLoad = async ({ params, url, depends }) => {
	// Live-sync: re-run when these sections change (experience feeds the data
	// draft's derivedEntities inside the use case).
	depends(sectionSyncKey(params.projectId, 'data'));
	depends(sectionSyncKey(params.projectId, 'architecture'));
	depends(sectionSyncKey(params.projectId, 'foundation'));
	depends(sectionSyncKey(params.projectId, 'experience'));
	// The graph tab reads every context, so it depends on the project-wide key.
	depends(projectSyncKey(params.projectId));
	const services = getServices();
	const [draft, archDraft, initDraft, revision, archRevision, experienceDraft] = await Promise.all([
		services.loadDataDraft.execute(params.projectId),
		services.loadArchitectureDraft.execute(params.projectId),
		services.loadFoundationDraft.loadIdentity(params.projectId),
		services.draftLock.current(params.projectId, 'data'),
		services.sectionDocuments.currentRevision(params.projectId, 'architecture'),
		// The experience model is the source of truth for what the CLIENT surfaces;
		// the Data Inventory tab cross-checks the data model against it.
		services.loadExperienceDraft.execute(params.projectId)
	]);
	// Which entities/fields the client experience actually shows (ids). Effective
	// visibility (with the user's overrides) is computed on the client, live.
	const derivedVisibility = deriveDataVisibility(draft, experienceDraft);
	const productName = initDraft.productName.trim() || 'Untitled project';
	const industryLabel =
		industryLabelOf(initDraft.industry);
	const session = services.currentSession();

	// DEFAULT (`merged`): wizard projection + unspa behavior, plus DPO in Enterprise.
	// `?source=engine` is Enterprise-only; `?source=local` shows the wizard
	// projection alone. The tab keys on source, so flipping the toggle rebuilds it.
	const sourceParam = url.searchParams.get('source');
	const graphSource: 'engine' | 'local' | 'merged' =
		sourceParam === 'engine' ? 'engine' : sourceParam === 'local' ? 'local' : 'merged';
	const graphProvider =
		graphSource === 'engine'
			? services.loadEngineKnowledgeGraph
			: graphSource === 'local'
				? services.loadKnowledgeGraph
				: services.loadMergedKnowledgeGraph;
	return {
		draft,
		archDraft,
		productName,
		industryLabel,
		session,
		revision,
		archRevision,
		derivedVisibility,
		// Unawaited on purpose (streamed); null on every other tab so the expensive
		// build never runs for someone editing hosts or tables.
		graph:
			url.searchParams.get('tab') === 'graph' ? graphProvider.execute(params.projectId) : null,
		// Also streamed, and only on the tab that shows it: the fold reads every
		// feature snapshot, which is far too much work for someone editing hosts.
		kernelResources:
			url.searchParams.get('tab') === 'stack'
				? readKernelResources(params.projectId, draft)
				: null,
		graphSource,
		formalDpoEnabled: tierHasFormalDpo(services.currentTier())
	};
};
