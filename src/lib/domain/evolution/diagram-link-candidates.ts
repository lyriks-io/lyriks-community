import type { GraphEdge, GraphNode } from '$domain/graph';
import { rawNodeId } from '$domain/graph/node-link';
import { actionRef, entityRef, featureRef, type DiagramLinkKind } from './diagram-links';

/**
 * What an element of a diagram may be linked to (ac-evo-func-uml-link,
 * ac-evo-tech-uml-link), read off the project's knowledge graph: its
 * features, the actions their behaviour models hold, each with the feature
 * that holds it, and the tables of its Data model.
 */
export interface LinkCandidate {
	readonly ref: string;
	readonly kind: DiagramLinkKind;
	readonly name: string;
	/** For an action, the feature that holds it. */
	readonly owner?: string;
	readonly href: string | null;
}

export function linkCandidates(
	graph: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] },
	hrefOf: (node: GraphNode) => string | null
): LinkCandidate[] {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const parentOf = new Map(graph.edges.filter((e) => e.kind === 'contains').map((e) => [e.to, e.from]));
	const features = graph.nodes.filter((n) => n.kind === 'feature' && n.context === 'features' && n.label.trim() !== '');
	const featureName = new Map(features.map((f) => [rawNodeId(f), f.label]));
	/** An action sits in a surface, which the behaviour twin of its feature holds. */
	const holderOf = (action: GraphNode): GraphNode | null => {
		const surface = parentOf.get(action.id);
		const holder = surface ? byId.get(parentOf.get(surface) ?? '') : undefined;
		return holder?.kind === 'feature' ? holder : null;
	};
	const out: LinkCandidate[] = features.map((f) => ({ ref: featureRef(rawNodeId(f)), kind: 'feature' as const, name: f.label, href: hrefOf(f) }));
	for (const node of graph.nodes) {
		if (node.kind === 'action' && node.label.trim() !== '') {
			const holder = holderOf(node);
			const featureId = holder ? rawNodeId(holder) : null;
			if (!featureId || !featureName.has(featureId)) continue;
			out.push({ ref: actionRef(featureId, rawNodeId(node)), kind: 'action', name: node.label, owner: featureName.get(featureId), href: hrefOf(holder!) });
		} else if (node.kind === 'entity' && node.context === 'data' && node.label.trim() !== '') {
			out.push({ ref: entityRef(rawNodeId(node)), kind: 'entity', name: node.label, href: hrefOf(node) });
		}
	}
	return out;
}

/**
 * What the picker offers for what is typed, of the kind the element takes:
 * names holding it, the ones that start with it first. With `refs`, the linked
 * elements that still exist, so a link to what is gone is pointed out.
 */
export function pickLinks(
	all: readonly LinkCandidate[],
	ask: { readonly q?: string; readonly kind?: DiagramLinkKind; readonly refs?: readonly string[]; readonly limit?: number }
): LinkCandidate[] {
	if (ask.refs) {
		const wanted = new Set(ask.refs);
		return all.filter((c) => wanted.has(c.ref));
	}
	const q = (ask.q ?? '').trim().toLowerCase();
	const held = (c: LinkCandidate) => c.name.toLowerCase().includes(q) || (c.owner ?? '').toLowerCase().includes(q);
	return all
		.filter((c) => (!ask.kind || c.kind === ask.kind) && held(c))
		.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
		.slice(0, ask.limit ?? 8);
}
