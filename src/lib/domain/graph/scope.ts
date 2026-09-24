/**
 * Scoping over a built Knowledge Graph — pure, total helpers that carve a
 * bounded subgraph out of the whole-project graph so consumers with a small
 * budget (the MCP tool, deep-linked explorer views) never have to swallow the
 * full node/edge set. Mirrors the layering of `graph.ts`: vocabulary + pure
 * functions only, no IO; the endpoint (`/api/graph`) parses the query string
 * into a `GraphScope` and delegates here.
 */

import {
	graphStats,
	type GraphContext,
	type GraphEdge,
	type GraphNode,
	type GraphNodeKind,
	type GraphStats,
	type KnowledgeGraph
} from './graph';
import { reachableIds, type WalkDirection } from './queries';

/** A declarative subgraph request — every field optional, all combinable. */
export interface GraphScope {
	/** Keep only nodes from these bounded contexts. */
	contexts?: readonly GraphContext[];
	/** Keep only nodes of these kinds. */
	kinds?: readonly GraphNodeKind[];
	/** Case-insensitive substring match on label / detail / id. */
	q?: string;
	/** Expand a neighborhood around this node id before filtering. */
	focus?: string;
	/** Neighborhood radius. Default 1. */
	depth?: number;
	/**
	 * Which way the neighborhood is walked from the focus: `both` (default, the
	 * undirected neighbourhood), `in` (only what points at the focus: its
	 * dependants), `out` (only what the focus points at: its dependencies).
	 */
	direction?: WalkDirection;
	/** Hard cap on returned nodes; highest-degree nodes win. */
	limit?: number;
}

/** A scoped result — still a full `KnowledgeGraph` (stats recomputed on the subgraph). */
export interface ScopedGraph extends KnowledgeGraph {
	/** Node count matching the scope BEFORE the `limit` cap was applied. */
	matchedNodeCount: number;
	/** True when `limit` dropped matching nodes — tells the caller to narrow the scope. */
	truncated: boolean;
	/**
	 * Present iff the scope had a `focus`: the node id it resolved to, or `null`
	 * when nothing (or nothing unambiguous) matched — an empty result then means
	 * "bad reference, search with q= instead", not "the node has no neighbors".
	 */
	focusNodeId?: string | null;
	/**
	 * Present when `q` and `kinds` were both given and some node of the asked
	 * kinds is kept because something it OWNS matched rather than itself: its id,
	 * to the owned nodes that matched (id and label). "jog" lives in a criterion
	 * of a feature whose name and description never say it.
	 */
	matchedVia?: Record<string, { id: string; kind: GraphNodeKind; label: string }[]>;
}

/** node id -> degree, counting both directions. */
function degrees(edges: readonly GraphEdge[]): Map<string, number> {
	const byNode = new Map<string, number>();
	for (const edge of edges) {
		byNode.set(edge.from, (byNode.get(edge.from) ?? 0) + 1);
		byNode.set(edge.to, (byNode.get(edge.to) ?? 0) + 1);
	}
	return byNode;
}

/** Ids reachable from `focus` within `depth` hops in `direction` (focus included). */
function neighborhoodIds(
	graph: KnowledgeGraph,
	focus: string,
	depth: number,
	direction: WalkDirection
): Set<string> {
	return reachableIds(graph, focus, { direction, depth });
}

/**
 * Resolve a focus reference the way a caller (often an LLM over MCP) writes it:
 * exact node id first, then a raw id without the `kind:` prefix, then a
 * case-insensitive label. A reference matching several nodes (labels repeat
 * across kinds) lands on the best-connected candidate — never silently: the
 * scoped result reports the landing id in `focusNodeId`. Unknown references
 * resolve to undefined.
 */
function resolveFocus(graph: KnowledgeGraph, focus: string): string | undefined {
	if (graph.nodes.some((node) => node.id === focus)) return focus;
	const needle = focus.trim().toLowerCase();
	if (!needle) return undefined;
	const pick = (candidates: readonly GraphNode[]): string | undefined => {
		if (candidates.length === 0) return undefined;
		const degree = degrees(graph.edges);
		return [...candidates].sort(
			(a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id)
		)[0].id;
	};
	const byRawId = graph.nodes.filter(
		(node) => node.id.slice(node.id.indexOf(':') + 1).toLowerCase() === needle
	);
	return (
		pick(byRawId) ??
		pick(graph.nodes.filter((node) => node.label.trim().toLowerCase() === needle))
	);
}

function matchesQuery(node: GraphNode, q: string): boolean {
	const needle = q.toLowerCase();
	return (
		node.label.toLowerCase().includes(needle) ||
		node.id.toLowerCase().includes(needle) ||
		(node.detail?.toLowerCase().includes(needle) ?? false)
	);
}

/**
 * Carve the subgraph a `GraphScope` describes. Order of operations: the focus
 * neighborhood (when given) narrows the candidate set first, then context /
 * kind / text filters intersect it, then `limit` keeps the best-connected
 * nodes. Edges survive only when both endpoints do.
 */
export function scopeGraph(graph: KnowledgeGraph, scope: GraphScope): ScopedGraph {
	let nodes = graph.nodes;
	let focusNodeId: string | null | undefined;
	if (scope.focus !== undefined) {
		focusNodeId = resolveFocus(graph, scope.focus) ?? null;
		const keep = focusNodeId
			? neighborhoodIds(
					graph,
					focusNodeId,
					Math.max(1, scope.depth ?? 1),
					scope.direction ?? 'both'
				)
			: new Set<string>();
		nodes = nodes.filter((node) => keep.has(node.id));
	}
	if (scope.contexts?.length) {
		const keep = new Set(scope.contexts);
		nodes = nodes.filter((node) => keep.has(node.context));
	}
	const candidates = nodes;
	if (scope.kinds?.length) {
		const keep = new Set(scope.kinds);
		nodes = nodes.filter((node) => keep.has(node.kind));
	}
	let matchedVia: ScopedGraph['matchedVia'];
	if (scope.q && scope.kinds?.length) {
		// Asked for features (say) about a word: a feature is about it when one of
		// its criteria, actions or rules says it, not only its own label.
		const wanted = new Set(scope.kinds);
		const direct = nodes.filter((node) => matchesQuery(node, scope.q ?? ''));
		const owners = ownersOfKinds(graph, candidates.filter((node) => !wanted.has(node.kind) && matchesQuery(node, scope.q ?? '')), wanted);
		const kept = new Set(direct.map((node) => node.id));
		const allowed = new Set(nodes.map((node) => node.id));
		for (const [ownerId, via] of owners) {
			if (!allowed.has(ownerId)) continue;
			matchedVia ??= {};
			matchedVia[ownerId] = via.slice(0, 5).map((n) => ({ id: n.id, kind: n.kind, label: n.label }));
			kept.add(ownerId);
		}
		nodes = nodes.filter((node) => kept.has(node.id));
	} else if (scope.q) nodes = nodes.filter((node) => matchesQuery(node, scope.q ?? ''));

	const matchedNodeCount = nodes.length;
	let truncated = false;
	if (scope.limit !== undefined && nodes.length > scope.limit) {
		// Keep the best-connected matches: they anchor follow-up focus queries.
		const degree = degrees(graph.edges);
		nodes = [...nodes]
			.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
			.slice(0, Math.max(0, scope.limit));
		truncated = true;
	}

	const kept = new Set(nodes.map((node) => node.id));
	const edges = graph.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to));
	return {
		projectId: graph.projectId,
		generatedAt: graph.generatedAt,
		nodes,
		edges,
		stats: graphStats(nodes, edges),
		matchedNodeCount,
		truncated,
		...(focusNodeId !== undefined ? { focusNodeId } : {}),
		...(matchedVia ? { matchedVia } : {})
	};
}

/** How far up the ownership tree a match climbs: rule, action, surface, feature. */
const OWNER_DEPTH = 5;

/**
 * The nearest owners of the asked kinds for each matched node, climbing
 * `contains` edges from child to parent, and crossing `binds` either way
 * (a Lyriks feature and its behavior counterpart are one thing seen twice).
 */
function ownersOfKinds(
	graph: KnowledgeGraph,
	matched: readonly GraphNode[],
	wanted: ReadonlySet<GraphNodeKind>
): Map<string, GraphNode[]> {
	const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	const up = new Map<string, string[]>();
	const link = (from: string, to: string) => up.set(from, [...(up.get(from) ?? []), to]);
	for (const edge of graph.edges) {
		if (edge.kind === 'contains') link(edge.to, edge.from);
		else if (edge.kind === 'binds') {
			link(edge.to, edge.from);
			link(edge.from, edge.to);
		}
	}
	const owners = new Map<string, GraphNode[]>();
	for (const node of matched) {
		const seen = new Set([node.id]);
		let frontier = [node.id];
		for (let level = 0; level < OWNER_DEPTH && frontier.length > 0; level++) {
			const next: string[] = [];
			for (const id of frontier)
				for (const parent of up.get(id) ?? []) {
					if (seen.has(parent)) continue;
					seen.add(parent);
					const owner = byId.get(parent);
					if (owner && wanted.has(owner.kind)) owners.set(parent, [...(owners.get(parent) ?? []), node]);
					else next.push(parent);
				}
			frontier = next;
		}
	}
	return owners;
}

/** A cheap first look at a graph: full stats + its best-connected nodes. */
export interface GraphOverview {
	projectId: string;
	generatedAt: string;
	/** Stats over the WHOLE graph (not a subgraph). */
	stats: GraphStats;
	/** The `topNodeCount` best-connected nodes — entry points for focus queries. */
	topNodes: GraphNode[];
}

const DEFAULT_TOP_NODES = 25;

/**
 * Orientation view for consumers that must not load the full graph up front:
 * whole-graph stats (what contexts/kinds exist, and how many of each) plus the
 * hub nodes worth drilling into with a focused `scopeGraph` call.
 */
export function graphOverview(graph: KnowledgeGraph, topNodeCount = DEFAULT_TOP_NODES): GraphOverview {
	const degree = degrees(graph.edges);
	const topNodes = [...graph.nodes]
		.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
		.slice(0, topNodeCount);
	return {
		projectId: graph.projectId,
		generatedAt: graph.generatedAt,
		stats: graph.stats,
		topNodes
	};
}
