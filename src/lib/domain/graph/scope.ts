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
	/** Neighborhood radius (edges are walked undirected). Default 1. */
	depth?: number;
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

/** Ids reachable from `focus` within `depth` undirected hops (focus included). */
function neighborhoodIds(graph: KnowledgeGraph, focus: string, depth: number): Set<string> {
	const reached = new Set<string>([focus]);
	let frontier = new Set<string>([focus]);
	for (let hop = 0; hop < depth && frontier.size > 0; hop++) {
		const next = new Set<string>();
		for (const edge of graph.edges) {
			if (frontier.has(edge.from) && !reached.has(edge.to)) next.add(edge.to);
			if (frontier.has(edge.to) && !reached.has(edge.from)) next.add(edge.from);
		}
		for (const id of next) reached.add(id);
		frontier = next;
	}
	return reached;
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
			? neighborhoodIds(graph, focusNodeId, Math.max(1, scope.depth ?? 1))
			: new Set<string>();
		nodes = nodes.filter((node) => keep.has(node.id));
	}
	if (scope.contexts?.length) {
		const keep = new Set(scope.contexts);
		nodes = nodes.filter((node) => keep.has(node.context));
	}
	if (scope.kinds?.length) {
		const keep = new Set(scope.kinds);
		nodes = nodes.filter((node) => keep.has(node.kind));
	}
	if (scope.q) nodes = nodes.filter((node) => matchesQuery(node, scope.q ?? ''));

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
		...(focusNodeId !== undefined ? { focusNodeId } : {})
	};
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
