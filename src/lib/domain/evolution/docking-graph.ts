import type { GraphEdgeKind, GraphNode } from '$domain/graph';
import { changesWithHolders, isChange, type LocalGraph, type LocalNode } from './local-graph';

/**
 * Where the request's changes dock on the product (302d93bf, d2477e20). The
 * changes keep their colour, with the nodes that hold them; around the changes
 * and only them, the existing elements of the project's knowledge graph they
 * touch at one hop, with the knowledge graph's own link kinds. Pure: computed
 * from two graphs on demand, saving nothing.
 */

export interface DockedNode {
	readonly id: string;
	readonly label: string;
	/** The request's own node, or an existing element the request docks on. */
	readonly local: LocalNode | null;
	/** The knowledge graph node it lands on; null for a request node the graph does not hold yet. */
	readonly source: GraphNode | null;
}

export interface DockedEdge {
	readonly from: string;
	readonly to: string;
	readonly kind: GraphEdgeKind;
}

export interface DockingGraph {
	readonly nodes: readonly DockedNode[];
	readonly edges: readonly DockedEdge[];
	/** Links from a request node to an existing element it does not touch itself. */
	readonly dockCount: number;
	/** Existing neighbours left out once the cap was reached. */
	readonly omitted: number;
}

interface KgInput {
	readonly nodes: readonly GraphNode[];
	readonly edges: readonly { readonly from: string; readonly to: string; readonly kind: GraphEdgeKind }[];
}

/** Neighbours beyond this many stop telling the reader anything about the change. */
export const DOCKING_NEIGHBOUR_CAP = 60;

/**
 * What never counts as a docking point: the root, readings computed about the
 * product, and the tests a feature carries inside it (scenarios, criteria).
 */
const NOT_A_DOCK = new Set(['project', 'gap', 'issue', 'scenario', 'criterion']);
const NOT_A_DOCK_CONTEXT = new Set(['coherence', 'engine']);

/** The knowledge graph id a request node stands for, when it has one. */
function kgIdOf(node: LocalNode, featureOf: (node: LocalNode) => string | null): string | null {
	const rest = node.id.slice(node.id.indexOf(':') + 1);
	switch (node.kind) {
		case 'core':
		case 'feature':
		case 'surface':
		case 'action':
			return node.id;
		case 'state':
			return `state:${node.label}`;
		case 'event':
			return `event:${node.label}`;
		case 'rule': {
			const fid = featureOf(node);
			return fid ? `rule:beh:${fid}:${rest}` : null;
		}
		case 'table':
			return `entity:${rest}`;
		case 'field':
			return `field:${rest.slice(rest.lastIndexOf(':') + 1)}`;
		default:
			return null;
	}
}

export function dockingGraphOf(graph: LocalGraph, kg: KgInput, cap = DOCKING_NEIGHBOUR_CAP): DockingGraph {
	const local = { nodes: changesWithHolders(graph.nodes) };
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const featureOf = (node: LocalNode): string | null => {
		let at: LocalNode | undefined = node;
		while (at && at.kind !== 'feature') at = at.parentId ? byId.get(at.parentId) : undefined;
		return at ? at.id.slice('feature:'.length) : null;
	};
	const kgNodes = new Map(kg.nodes.map((n) => [n.id, n]));

	// One docked node per knowledge-graph id: a request node takes the id it stands for.
	const toDocked = new Map<string, string>();
	const nodes = new Map<string, DockedNode>();
	for (const node of local.nodes) {
		const kgId = kgIdOf(node, featureOf);
		const id = kgId && kgNodes.has(kgId) ? kgId : node.id;
		toDocked.set(node.id, id);
		if (!nodes.has(id)) nodes.set(id, { id, label: node.label, local: node, source: kgNodes.get(id) ?? null });
	}

	const edges = new Map<string, DockedEdge>();
	const link = (from: string, to: string, kind: GraphEdgeKind) => {
		if (from === to) return;
		const key = `${from}|${to}|${kind}`;
		if (!edges.has(key)) edges.set(key, { from, to, kind });
	};
	for (const node of local.nodes) {
		if (node.parentId && byId.has(node.parentId)) link(toDocked.get(node.parentId)!, toDocked.get(node.id)!, 'contains');
	}

	// The existing elements the changes meet, ranked by how many changes they touch.
	// A holder drawn only to place a change docks nothing of its own.
	const anchors = new Set([...nodes.values()].filter((n) => n.local && isChange(n.local)).map((n) => n.id));
	const contacts = new Map<string, DockedEdge[]>();
	for (const edge of kg.edges) {
		const fromIn = nodes.has(edge.from);
		const toIn = nodes.has(edge.to);
		if (fromIn && toIn) {
			link(edge.from, edge.to, edge.kind);
			continue;
		}
		if (!(fromIn ? anchors.has(edge.from) : toIn && anchors.has(edge.to))) continue;
		const other = kgNodes.get(fromIn ? edge.to : edge.from);
		if (!other || NOT_A_DOCK.has(other.kind) || NOT_A_DOCK_CONTEXT.has(other.context)) continue;
		contacts.set(other.id, [...(contacts.get(other.id) ?? []), edge]);
	}
	const ranked = [...contacts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
	let dockCount = 0;
	for (const [id, through] of ranked.slice(0, cap)) {
		const kgNode = kgNodes.get(id)!;
		nodes.set(id, { id, label: kgNode.label, local: null, source: kgNode });
		for (const edge of through) {
			link(edge.from, edge.to, edge.kind);
			dockCount += 1;
		}
	}
	return { nodes: [...nodes.values()], edges: [...edges.values()], dockCount, omitted: Math.max(0, ranked.length - cap) };
}
