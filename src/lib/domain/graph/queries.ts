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
