import type { AppServices } from '$composition/container.server';
import { resolveWalkTarget } from '$application/analysis/simulate-behavior';
import { behaviourOperationCount, dockingGraphOf, localGraphOf, type DockingGraph, type EvolutionRequest, type LocalGraph } from '$domain/evolution';
import { mapLimit } from '$lib/shared/map-limit';
import type { EvolutionView } from './evolution-view.server';

type Snapshot = Record<string, unknown> | null;

/**
 * The graph of one request (ac-evo-graph-local): each touched feature read as it
 * stands, each draft read as its behaviour model would make it. Computed on
 * demand, saving nothing; a draft the engine cannot replay reads as the feature
 * it stands for, so the graph never invents a change.
 */
export async function loadLocalGraph(
	services: AppServices,
	view: EvolutionView,
	request: EvolutionRequest
): Promise<LocalGraph> {
	const leafIds = [
		...new Set([
			...request.leafIds.filter((id) => !request.drafts.some((d) => d.id === id)),
			...request.drafts.map((d) => d.baseLeafId).filter((id): id is string => !!id)
		])
	];
	const base = Object.fromEntries(
		await mapLimit(leafIds, 2, async (id) => {
			const snapshot = await services.readBehaviorFeature.execute(view.projectId, id).catch(() => null);
			return [id, (snapshot?.feature as Snapshot) ?? null] as const;
		})
	);
	const modelled = request.drafts.filter((d) => behaviourOperationCount(d.behaviourModel) > 0);
	const drafted = Object.fromEntries(
		await mapLimit(modelled, 2, async (draft) => [draft.id, await draftFeature(services, view.draft, draft.id)] as const)
	);
	return localGraphOf({
		request,
		cores: view.features.cores.map((c) => ({ id: c.id, name: c.name })),
		leaves: view.features.features.map((f) => ({ id: f.id, name: f.name, coreId: f.coreId })),
		base,
		drafted,
		data: {
			entities: view.data.entities.map((e) => ({ id: e.id, name: e.name })),
			fields: view.data.fields.map((f) => ({ id: f.id, name: f.name }))
		},
		lang: view.language
	});
}

/**
 * The request as a network docked on the product (ac-evo-graph-docking): its
 * own graph laid on the project's knowledge graph, read on demand only when a
 * reader opens the network, saving nothing.
 */
export async function loadDockingGraph(
	services: AppServices,
	view: EvolutionView,
	request: EvolutionRequest
): Promise<DockingGraph> {
	const [local, knowledge] = await Promise.all([
		loadLocalGraph(services, view, request),
		// The graph the Knowledge graph tab opens on: the projection with the behaviour laid in.
		services.loadMergedKnowledgeGraph.execute(view.projectId)
	]);
	return dockingGraphOf(local, knowledge);
}

/** The feature a draft's behaviour model would make, computed by the engine and saved nowhere. */
export async function draftFeature(services: AppServices, evolution: EvolutionView['draft'], draftId: string): Promise<Snapshot> {
	const resolved = resolveWalkTarget(draftId, evolution, false);
	if (!resolved.ok || resolved.target.kind !== 'draft') return null;
	const answer = await services.simulateBehavior.draftFeatureWalk(evolution.projectId, resolved.target).catch(() => null);
	if (!answer || answer.kind === 'refused') return null;
	const walk = answer.walk as { ok?: unknown; feature?: unknown };
	return walk.ok === true && walk.feature && typeof walk.feature === 'object' ? (walk.feature as Snapshot) : null;
}
