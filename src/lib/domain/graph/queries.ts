/**
 * Read queries over a built Knowledge Graph: the pure primitives every
 * cross-section reader shares. What depends on a node, what a node depends on,
 * what is reachable within N hops. The coherence checks, the impact reports and
 * the deletion warnings are meant to walk ONE graph the same way, through these,
 * instead of each re-deriving links from the section documents.
 *
 * Same layering as `graph.ts` and `scope.ts`: vocabulary + total functions, no
 * IO. An adjacency index is built once per graph object and memoized on it, so
 * a graph served from the revision cache answers repeated walks at the cost of
 * their result, not of the whole edge list.
 */

import type { GraphEdge, GraphEdgeKind, GraphNode, KnowledgeGraph } from './graph';

/** Which way a walk follows edges. */
export type WalkDirection =
	/** What the node points at (its dependencies). */
	| 'out'
	/** What points at the node (its dependants). */
	| 'in'
	/** Both, the undirected neighbourhood. */
	| 'both';

export interface WalkOptions {
	/** Default `both`. */
	direction?: WalkDirection;
	/** Maximum hops from the start node. Default 1. */
	depth?: number;
	/** Follow only edges of these kinds. Default: every kind. */
	edgeKinds?: readonly GraphEdgeKind[];
}

/** Adjacency over one graph: nodes by id, edges by their endpoints. */
export interface GraphIndex {
	readonly graph: KnowledgeGraph;
	readonly nodesById: ReadonlyMap<string, GraphNode>;
	readonly outgoing: ReadonlyMap<string, readonly GraphEdge[]>;
	readonly incoming: ReadonlyMap<string, readonly GraphEdge[]>;
}

/** A node met during a walk, with how many hops away from the start it sits. */
export interface ReachedNode {
	node: GraphNode;
	hops: number;
}

const EMPTY: readonly GraphEdge[] = [];
const INDEXES = new WeakMap<KnowledgeGraph, GraphIndex>();

function push(map: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void {
	const list = map.get(key);
	if (list) list.push(edge);
	else map.set(key, [edge]);
}

/** Build the adjacency index of a graph. Prefer `indexOf`, which memoizes it. */
export function indexGraph(graph: KnowledgeGraph): GraphIndex {
	const nodesById = new Map<string, GraphNode>();
	for (const node of graph.nodes) nodesById.set(node.id, node);
	const outgoing = new Map<string, GraphEdge[]>();
	const incoming = new Map<string, GraphEdge[]>();
	for (const edge of graph.edges) {
		push(outgoing, edge.from, edge);
		push(incoming, edge.to, edge);
	}
	return { graph, nodesById, outgoing, incoming };
}

/** The index of a graph, built on first use and reused for the life of the graph object. */
export function indexOf(source: KnowledgeGraph | GraphIndex): GraphIndex {
	if ('nodesById' in source) return source;
	const cached = INDEXES.get(source);
	if (cached) return cached;
	const built = indexGraph(source);
	INDEXES.set(source, built);
	return built;
}

function keep(edgeKinds: readonly GraphEdgeKind[] | undefined): (edge: GraphEdge) => boolean {
	if (!edgeKinds || edgeKinds.length === 0) return () => true;
	const allowed = new Set(edgeKinds);
	return (edge) => allowed.has(edge.kind);
}

/** Edges pointing AT a node (what references it), optionally of given kinds. */
export function edgesInto(
	source: KnowledgeGraph | GraphIndex,
	nodeId: string,
	edgeKinds?: readonly GraphEdgeKind[]
): readonly GraphEdge[] {
	const edges = indexOf(source).incoming.get(nodeId) ?? EMPTY;
	return edgeKinds?.length ? edges.filter(keep(edgeKinds)) : edges;
}

/** Edges leaving a node (what it references), optionally of given kinds. */
export function edgesOutOf(
	source: KnowledgeGraph | GraphIndex,
	nodeId: string,
	edgeKinds?: readonly GraphEdgeKind[]
): readonly GraphEdge[] {
	const edges = indexOf(source).outgoing.get(nodeId) ?? EMPTY;
	return edgeKinds?.length ? edges.filter(keep(edgeKinds)) : edges;
}

/**
 * Breadth-first walk from `start`: node id -> hops (the start itself at 0).
 * Bounded by `depth`; a node is recorded at the first hop it is met. An
 * unknown start yields the start alone, so callers never branch on absence.
 */
export function walk(
	source: KnowledgeGraph | GraphIndex,
	start: string,
	options: WalkOptions = {}
): Map<string, number> {
	const index = indexOf(source);
	const direction = options.direction ?? 'both';
	const depth = Math.max(0, options.depth ?? 1);
	const follow = keep(options.edgeKinds);
	const reached = new Map<string, number>([[start, 0]]);
	let frontier: string[] = [start];
	for (let hop = 1; hop <= depth && frontier.length > 0; hop++) {
		const next: string[] = [];
		for (const id of frontier) {
			if (direction !== 'in') {
				for (const edge of index.outgoing.get(id) ?? EMPTY) {
					if (!follow(edge) || reached.has(edge.to)) continue;
					reached.set(edge.to, hop);
					next.push(edge.to);
				}
			}
			if (direction !== 'out') {
				for (const edge of index.incoming.get(id) ?? EMPTY) {
					if (!follow(edge) || reached.has(edge.from)) continue;
					reached.set(edge.from, hop);
					next.push(edge.from);
				}
			}
		}
		frontier = next;
	}
	return reached;
}

/** Ids reachable from `start` within the walk (start included). */
export function reachableIds(
	source: KnowledgeGraph | GraphIndex,
	start: string,
	options: WalkOptions = {}
): Set<string> {
	return new Set(walk(source, start, options).keys());
}

function reachedNodes(index: GraphIndex, hops: Map<string, number>, start: string): ReachedNode[] {
	const out: ReachedNode[] = [];
	for (const [id, distance] of hops) {
		if (id === start) continue;
		const node = index.nodesById.get(id);
		if (node) out.push({ node, hops: distance });
	}
	return out.sort((a, b) => a.hops - b.hops || a.node.id.localeCompare(b.node.id));
}

/**
 * What depends on a node: everything that points at it, transitively up to
 * `depth` hops, nearest first. Deleting or changing the node reaches these.
 */
export function dependantsOf(
	source: KnowledgeGraph | GraphIndex,
	nodeId: string,
	options: Omit<WalkOptions, 'direction'> = {}
): ReachedNode[] {
	const index = indexOf(source);
	return reachedNodes(index, walk(index, nodeId, { ...options, direction: 'in' }), nodeId);
}

/**
 * What a node depends on: everything it points at, transitively up to `depth`
 * hops, nearest first. These must exist for the node to make sense.
 */
export function dependenciesOf(
	source: KnowledgeGraph | GraphIndex,
	nodeId: string,
	options: Omit<WalkOptions, 'direction'> = {}
): ReachedNode[] {
	const index = indexOf(source);
	return reachedNodes(index, walk(index, nodeId, { ...options, direction: 'out' }), nodeId);
}
