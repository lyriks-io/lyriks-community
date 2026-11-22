import { createHash } from 'node:crypto';
import type { AppServices } from '$composition/container.server';
import { resolveWalkTarget } from '$application/analysis/simulate-behavior';
import { ACTIONS_UNREAD, behaviourOperationCount, dockingGraphOf, localGraphOf, type DockingGraph, type EvolutionRequest, type LocalGraph } from '$domain/evolution';
import { mapLimit } from '$lib/shared/map-limit';
import type { EvolutionView } from './evolution-view.server';

type Snapshot = Record<string, unknown> | null;

/** The last good graph of one request, for the drafts it was read from. */
interface LastGood {
	readonly graph: LocalGraph;
	readonly readAt: string;
}

/**
 * The graph of a request as the engine read it, or why it could not
 * (criterion c623df9c). There is no graph on an unread reading but the last
 * good one of the same request and drafts, so no caller can take a fallback for
 * the Specification without saying so.
 */
export type LocalGraphReading =
	| { readonly status: 'read'; readonly graph: LocalGraph; readonly readAt: string }
	| { readonly status: 'unread'; readonly reason: string; readonly last: LastGood | null };

/**
 * What a draft's behaviour model makes, as the engine answered. The only way to
 * read a draft: a reader handles `unanswered` (keeps its last good result or
 * refuses, criteria c623df9c, 837e56b6, 39c8df88), never takes it for a draft
 * that holds nothing.
 */
export type DraftFeatureReading =
	| { readonly status: 'computed'; readonly feature: Snapshot }
	/** The engine refused the model, or the draft names nothing to replay: it reads as the feature it stands for. */
	| { readonly status: 'none' }
	/** The engine did not answer (a timeout, a busy or restarted engine). */
	| { readonly status: 'unanswered' };

/** A stored feature as the store answered: its tree (null when there is none), or unanswered when it could not be read. */
export type StoredFeatureReading = { readonly status: 'read'; readonly feature: Snapshot } | { readonly status: 'unanswered' };

/** A stored feature, read: an unreadable one is said, never taken for an absent one. */
export async function readStoredFeature(services: AppServices, projectId: string, featureId: string): Promise<StoredFeatureReading> {
	return services.readBehaviorFeature.execute(projectId, featureId).then(
		(snapshot) => ({ status: 'read', feature: (snapshot?.feature as Snapshot) ?? null }),
		() => ({ status: 'unanswered' })
	);
}

// Requests whose last good graph is kept, all projects together.
const LAST_GOOD_KEPT = 200;
const lastGood = new Map<string, LastGood>();

/**
 * What a request's graph is read from on its side: its touched features and its
 * drafts with their models. A last good graph is kept under it, so it is never
 * shown for another request, nor for older drafts.
 */
export function draftsVersionOf(request: EvolutionRequest): string {
	const drafts = request.drafts.map((d) => [d.id, d.kind, d.baseLeafId, d.materialisedAs, d.behaviourModel?.operations ?? [], d.behaviourModel?.mintedIds ?? [], d.behaviourModel?.landed?.operations ?? []]);
	return createHash('sha256').update(JSON.stringify([request.leafIds, drafts])).digest('hex');
}

const lastGoodKey = (projectId: string, request: EvolutionRequest) => `${projectId}\u0000${request.id}\u0000${draftsVersionOf(request)}`;

function keepLastGood(key: string, kept: LastGood): void {
	lastGood.delete(key);
	lastGood.set(key, kept);
	for (const oldest of lastGood.keys()) {
		if (lastGood.size <= LAST_GOOD_KEPT) break;
		lastGood.delete(oldest);
	}
}

/**
 * The graph of one request (ac-evo-graph-local): each touched feature read as it
 * stands, each draft read as its behaviour model would make it. Computed on
 * demand, saving nothing. A draft the engine refuses reads as the feature it
 * stands for, so the graph never invents a change; a draft or a feature the
 * engine or the store did not answer for makes the reading unread, with the last
 * good one of the same drafts, never a graph read as if the drafts were not there.
 */
export async function loadLocalGraph(services: AppServices, view: EvolutionView, request: EvolutionRequest): Promise<LocalGraphReading> {
	const key = lastGoodKey(view.projectId, request);
	let unanswered = false;
	const leafIds = [
		...new Set([
			...request.leafIds.filter((id) => !request.drafts.some((d) => d.id === id)),
			...request.drafts.map((d) => d.baseLeafId).filter((id): id is string => !!id)
		])
	];
	const base = Object.fromEntries(
		await mapLimit(leafIds, 2, async (id) => {
			const reading = await readStoredFeature(services, view.projectId, id);
			if (reading.status === 'unanswered') unanswered = true;
			return [id, reading.status === 'read' ? reading.feature : null] as const;
		})
	);
	const modelled = request.drafts.filter((d) => behaviourOperationCount(d.behaviourModel) > 0);
	const drafted = Object.fromEntries(
		await mapLimit(modelled, 2, async (draft) => {
			const reading = await readDraftFeature(services, view.draft, draft.id);
			if (reading.status === 'unanswered') unanswered = true;
			return [draft.id, reading.status === 'computed' ? reading.feature : null] as const;
		})
	);
	if (unanswered) return { status: 'unread', reason: ACTIONS_UNREAD, last: lastGood.get(key) ?? null };
	const graph = localGraphOf({
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
	const readAt = services.clock.nowIso();
	keepLastGood(key, { graph, readAt });
	return { status: 'read', graph, readAt };
}

/**
 * The request as a network docked on the product (ac-evo-graph-docking): its
 * own graph laid on the project's knowledge graph, read on demand only when a
 * reader opens the network, saving nothing. Null when the engine did not answer.
 */
export async function loadDockingGraph(
	services: AppServices,
	view: EvolutionView,
	request: EvolutionRequest
): Promise<DockingGraph | null> {
	const [local, knowledge] = await Promise.all([
		loadLocalGraph(services, view, request),
		// The graph the Knowledge graph tab opens on: the projection with the behaviour laid in.
		services.loadMergedKnowledgeGraph.execute(view.projectId)
	]);
	return local.status === 'read' ? dockingGraphOf(local.graph, knowledge) : null;
}

/** The feature a draft's behaviour model would make, computed by the engine and saved nowhere, or why there is none. */
export async function readDraftFeature(services: AppServices, evolution: EvolutionView['draft'], draftId: string): Promise<DraftFeatureReading> {
	const resolved = resolveWalkTarget(draftId, evolution, false);
	if (!resolved.ok || resolved.target.kind !== 'draft') return { status: 'none' };
	const answer = await services.simulateBehavior.draftFeatureWalk(evolution.projectId, resolved.target).catch(() => null);
	if (!answer) return { status: 'unanswered' };
	if (answer.kind === 'refused') return { status: 'none' };
	const walk = answer.walk as { ok?: unknown; feature?: unknown };
	return walk.ok === true && walk.feature && typeof walk.feature === 'object' ? { status: 'computed', feature: walk.feature as Snapshot } : { status: 'none' };
}
