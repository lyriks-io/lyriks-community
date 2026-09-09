/**
 * The Knowledge Graph vocabulary — the one central graph the whole spec hangs
 * off of (the "Knowledge Base graph" in the platform diagram).
 *
 * This module is PURE: types + total helpers, no IO, no framework, no imports
 * from other bounded contexts. The projection that FILLS a graph from the
 * per-context drafts lives in the application layer
 * (`application/build-knowledge-graph.ts`), exactly like the global coherence
 * aggregator — the domain here only owns the shared vocabulary so every reader
 * (API, viewer, a future Rust/engine adapter) speaks the same node/edge shape.
 */

/** The bounded context a node originates from — drives colour + filtering. */
export type GraphContext =
	| 'project'
	| 'foundation'
	| 'users'
	| 'features'
	| 'experience'
	| 'data'
	| 'rules'
	| 'architecture'
	| 'coherence'
	/** The real formal DPO/MRS engine graph (read from Lyriks-back), not a projection. */
	| 'engine'
	/** The Unspaghettit behavior model (features → surfaces → actions → events). */
	| 'behavior';

/** The concrete kind of a node within its context. */
export type GraphNodeKind =
	| 'project'
	| 'role'
	| 'capability'
	| 'core'
	| 'family'
	| 'feature'
	| 'release'
	| 'journey'
	| 'step'
	| 'screen'
	| 'component'
	| 'template'
	| 'element'
	| 'host'
	| 'database'
	| 'entity'
	| 'field'
	| 'interface'
	| 'rule'
	| 'issue'
	| 'tech'
	| 'referenceDoc'
	| 'constraint'
	| 'gap'
	// ── formal MRS engine node types (engine context) ──
	| 'function'
	| 'bus'
	| 'site'
	| 'resource'
	| 'graphNode'
	// ── Unspaghettit behavior model (behavior context) ──
	| 'surface'
	| 'action'
	| 'persona'
	| 'dependency'
	| 'state'
	| 'effect'
	| 'scenario'
	| 'event';

/** A typed relationship between two nodes. */
export type GraphEdgeKind =
	| 'contains' // structural ownership / hierarchy
	| 'performs' // role → journey
	| 'accesses' // role → capability / feature / journey
	| 'shows' // step → screen
	| 'uses' // screen → component, screen → template
	| 'reads' // step → entity (data consumed)
	| 'writes' // action|parameter|effect → state or entity
	| 'relates' // entity → entity (relation field)
	| 'scheduled' // feature → release (roadmap)
	| 'derives' // rule → its source artefact
	| 'flags' // gap → the node/context it concerns
	// ── formal MRS engine edge types (engine context) ──
	| 'hasSite' // function|bus → site
	| 'typedBy' // site → resource
	| 'connects' // site → site
	| 'hasBody' // function → graph
	| 'inherits' // resource → resource
	// ── Unspaghettit behavior model (behavior context) ──
	| 'emits' // action → event
	| 'binds' // Lyriks object → its canonical Unspaghettit counterpart
	| 'transitions' // action|surface → destination surface
	| 'tests' // scenario → action|state|rule under test
	| 'triggers' // event → action handler
	| 'guards'; // formal (DPO) verdict → the behavior/experience node it concerns

export interface GraphNode {
	/** Globally unique within a graph — `${kind}:${rawId}` by construction. */
	id: string;
	kind: GraphNodeKind;
	context: GraphContext;
	label: string;
	/** Optional one-line subtitle (description, type, etc.). */
	detail?: string;
	/** Small, display-only scalar bag (tier, severity, mvp tier, layer…). */
	meta?: Record<string, string | number | boolean>;
}

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
	kind: GraphEdgeKind;
	label?: string;
}

export interface GraphStats {
	nodeCount: number;
	edgeCount: number;
	byContext: Record<string, number>;
	byKind: Record<string, number>;
}

/** The whole project, as one graph. */
export interface KnowledgeGraph {
	projectId: string;
	generatedAt: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	stats: GraphStats;
}

/** Stable node id from a kind + a raw context id. */
export function nodeId(kind: GraphNodeKind, rawId: string): string {
	return `${kind}:${rawId}`;
}

/** Compute display stats over a node/edge set (pure). */
export function graphStats(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphStats {
	const byContext: Record<string, number> = {};
	const byKind: Record<string, number> = {};
	for (const n of nodes) {
		byContext[n.context] = (byContext[n.context] ?? 0) + 1;
		byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
	}
	return { nodeCount: nodes.length, edgeCount: edges.length, byContext, byKind };
}

/**
 * A small builder used by the projector: dedupes nodes and edges by id, resolves
 * edges after every context has contributed its nodes, and drops relationships
 * that are still dangling at build time. Deferring endpoint validation matters
 * for cross-context relationships: users are projected before features, and
 * experience is projected before data, but neither dependency should erase a
 * valid relationship merely because its target is added later.
 */
export class GraphBuilder {
	readonly #nodes = new Map<string, GraphNode>();
	readonly #edges = new Map<string, GraphEdge>();

	addNode(node: GraphNode): string {
		if (!this.#nodes.has(node.id)) this.#nodes.set(node.id, node);
		return node.id;
	}

	hasNode(id: string): boolean {
		return this.#nodes.has(id);
	}

	/** The node added under `id`, or undefined — read-only lookup for projectors. */
	getNode(id: string): GraphNode | undefined {
		return this.#nodes.get(id);
	}

	/** Queue an edge; dangling endpoints are filtered only once the graph is built. */
	addEdge(edge: GraphEdge): void {
		if (edge.from === edge.to) return;
		if (!this.#edges.has(edge.id)) this.#edges.set(edge.id, edge);
	}

	build(projectId: string, generatedAt: string): KnowledgeGraph {
		const nodes = [...this.#nodes.values()];
		const edges = [...this.#edges.values()].filter(
			(edge) => this.#nodes.has(edge.from) && this.#nodes.has(edge.to)
		);
		return { projectId, generatedAt, nodes, edges, stats: graphStats(nodes, edges) };
	}
}
