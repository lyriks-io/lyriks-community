import { anchorDomId, anchorOf } from '$domain/discussions';
import type { GraphEdge, GraphNode, GraphNodeKind } from './graph';
import { rawNodeId } from './node-link';

/**
 * What the app bar's search finds in a project, as the Specification 360°
 * shows it: its core features (kind "Feature"), their features (kind: the core
 * they belong to), the roles, the journeys, screens and components, the data
 * and the tech, and the glossary terms, each opening its page of the
 * Specification 360°. The finer grains of the graph (builder elements, fields,
 * health findings) are left out: the design's search does not list them.
 */
export interface SpecSearchEntry {
	readonly t: string;
	readonly k: string;
	readonly href: string;
	/** Where it sits when its kind does not say it: a rule's feature and action. */
	readonly at?: string;
	/** More words the search reads besides the title: a rule's reason (criterion e11bf80b). */
	readonly body?: string;
}

/** A rule as the feature page lists it under its action. */
export interface SpecSearchRule {
	readonly featureId: string;
	readonly featureName: string;
	readonly actionName: string;
	/** The rule's id on the feature page: the anchor its block carries. */
	readonly ruleId: string;
	/** The requirement sentence, what the rule is named by. */
	readonly sentence: string;
	/** Why it exists, '' when it gives no reason of its own. */
	readonly reason: string;
}

export interface SpecSearchTerm {
	readonly id: string;
	readonly term: string;
}

const PAGE_OF: Partial<Record<GraphNodeKind, { readonly page: string; readonly k: string }>> = {
	role: { page: 'users', k: 'Users and permissions' },
	journey: { page: 'experience', k: 'Experience' },
	screen: { page: 'experience', k: 'Experience' },
	component: { page: 'experience', k: 'Experience' },
	entity: { page: 'tech/data-map', k: 'Technology & data' },
	database: { page: 'tech/data-map', k: 'Technology & data' },
	tech: { page: 'tech/architecture', k: 'Technology & data' },
	interface: { page: 'tech/architecture', k: 'Technology & data' },
	constraint: { page: 'tech/requirements', k: 'Technology & data' }
};

export function specSearchEntries(
	projectId: string,
	graph: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] },
	terms: readonly SpecSearchTerm[]
): SpecSearchEntry[] {
	const base = `/projects/${encodeURIComponent(projectId)}/spec`;
	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const parentOf = new Map(graph.edges.filter((e) => e.kind === 'contains').map((e) => [e.to, e.from]));
	const coreOf = (node: GraphNode): GraphNode | null => {
		for (let up = parentOf.get(node.id); up; up = parentOf.get(up)) {
			const n = byId.get(up);
			if (n?.kind === 'core') return n;
		}
		return null;
	};
	const entries: SpecSearchEntry[] = [];
	for (const node of graph.nodes) {
		const label = node.label.trim();
		if (!label) continue;
		const raw = encodeURIComponent(rawNodeId(node));
		if (node.kind === 'core') entries.push({ t: label, k: 'Feature', href: `${base}/features/${raw}` });
		else if (node.kind === 'feature') entries.push({ t: label, k: coreOf(node)?.label.trim() || 'Feature', href: `${base}/features/${raw}` });
		else {
			const at = PAGE_OF[node.kind];
			if (at && node.context !== 'engine') entries.push({ t: label, k: at.k, href: `${base}/${at.page}` });
		}
	}
	for (const term of terms) {
		if (term.term.trim()) entries.push({ t: term.term.trim(), k: 'Glossary', href: `${base}/glossary?term=${encodeURIComponent(term.id)}` });
	}
	return entries;
}

/**
 * The rules of the specification as search entries (criterion e11bf80b): each
 * found by its sentence and its reason, opening the feature's page on the
 * action that holds it, the rule brought into view (the page selects the action
 * of the rule its address names, criterion 7d1e80b6).
 */
export function ruleSearchEntries(projectId: string, rules: readonly SpecSearchRule[]): SpecSearchEntry[] {
	const base = `/projects/${encodeURIComponent(projectId)}/spec/features`;
	return rules
		.filter((r) => r.sentence.trim())
		.map((r) => ({
			t: r.sentence.trim(),
			k: 'Rule',
			href: `${base}/${encodeURIComponent(r.featureId)}#${anchorDomId(anchorOf('rule', r.featureId, r.ruleId))}`,
			at: [r.featureName, r.actionName].map((x) => x.trim()).filter(Boolean).join(' · '),
			...(r.reason.trim() && r.reason.trim() !== r.sentence.trim() ? { body: r.reason.trim() } : {})
		}));
}
