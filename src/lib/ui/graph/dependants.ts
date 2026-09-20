import type { GraphEdge, GraphNode, GraphNodeKind } from '$domain/graph';

/**
 * What rests on one node of the spec, read from the knowledge graph.
 *
 * The deletion warnings (a feature leaf, a table) ask this before anything
 * goes: the answer is the set of nodes with an edge INTO the one about to be
 * deleted, grouped by kind and named. It comes from the one picture of the
 * spec, so a screen, a right or a rule that rests on the node is never missed
 * because it lives in another section.
 */

export interface DependantGroup {
	kind: GraphNodeKind;
	/** Plural-aware label for the group, e.g. "2 screens". */
	label: string;
	names: string[];
}

export interface DependantsReading {
	/** Distinct nodes resting on the focus. */
	total: number;
	/** Largest group first. */
	groups: DependantGroup[];
}

/** A subgraph as `/api/graph?focus=…&direction=in` returns it. */
export interface DependantsSource {
	nodes: readonly GraphNode[];
	edges: readonly GraphEdge[];
	focusNodeId?: string | null;
}

/**
 * Edges that describe the node rather than rest on it: a coherence gap or a
 * formal verdict about it, the binding to its kernel twin.
 */
const NOT_A_DEPENDANT: ReadonlySet<string> = new Set(['flags', 'guards', 'binds']);

/** Whose `contains` edge is ownership (the node lives under them), not dependency. */
const HOLDERS: ReadonlySet<string> = new Set(['project', 'core', 'family', 'database']);

const KIND_WORDS: Partial<Record<GraphNodeKind, [string, string]>> = {
	screen: ['screen', 'screens'],
	journey: ['journey', 'journeys'],
	step: ['journey step', 'journey steps'],
	role: ['role with access', 'roles with access'],
	capability: ['right', 'rights'],
	rule: ['rule', 'rules'],
	issue: ['open issue', 'open issues'],
	scenario: ['scenario', 'scenarios'],
	action: ['action', 'actions'],
	surface: ['surface', 'surfaces'],
	entity: ['table pointing at it', 'tables pointing at it'],
	field: ['field', 'fields'],
	feature: ['feature', 'features'],
	release: ['release', 'releases'],
	component: ['component', 'components'],
	template: ['template', 'templates'],
	element: ['screen element', 'screen elements'],
	state: ['state', 'states'],
	criterion: ['acceptance criterion', 'acceptance criteria'],
	constant: ['constant', 'constants'],
	valueSet: ['value set', 'value sets'],
	effect: ['effect', 'effects'],
	event: ['event', 'events'],
	persona: ['persona', 'personas'],
	interface: ['interface', 'interfaces'],
	constraint: ['constraint', 'constraints'],
	tech: ['tech choice', 'tech choices'],
	host: ['host', 'hosts']
};

function words(kind: GraphNodeKind, count: number): string {
	const pair = KIND_WORDS[kind] ?? [kind, `${kind}s`];
	return `${count} ${count === 1 ? pair[0] : pair[1]}`;
}

/** Group the nodes resting on `focusId`, largest group first, names deduplicated. */
export function collectDependants(source: DependantsSource, focusId: string): DependantsReading {
	const byId = new Map(source.nodes.map((node) => [node.id, node]));
	const seen = new Set<string>();
	const groups = new Map<GraphNodeKind, string[]>();
	for (const edge of source.edges) {
		if (edge.to !== focusId || edge.from === focusId) continue;
		if (NOT_A_DEPENDANT.has(edge.kind)) continue;
		const node = byId.get(edge.from);
		if (!node || seen.has(node.id)) continue;
		if (edge.kind === 'contains' && HOLDERS.has(node.kind)) continue;
		seen.add(node.id);
		const names = groups.get(node.kind) ?? [];
		if (!names.includes(node.label)) names.push(node.label);
		groups.set(node.kind, names);
	}
	const ordered = [...groups.entries()]
		.map(([kind, names]) => ({ kind, names: [...names].sort(), label: words(kind, names.length) }))
		.sort((a, b) => b.names.length - a.names.length || a.kind.localeCompare(b.kind));
	return { total: seen.size, groups: ordered };
}

function joinClauses(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? '';
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * One sentence a person can act on: "2 screens (Cart, Checkout) and 1 rule
 * (Refund window) rest on it." or "Nothing else in the spec rests on it."
 */
export function describeDependants(
	reading: DependantsReading,
	options: { withNames?: boolean; maxNames?: number } = {}
): string {
	if (reading.total === 0) return 'Nothing else in the spec rests on it.';
	const maxNames = options.maxNames ?? 4;
	const clauses = reading.groups.map((group) => {
		if (!options.withNames) return group.label;
		const shown = group.names.slice(0, maxNames);
		const more = group.names.length - shown.length;
		return `${group.label} (${shown.join(', ')}${more > 0 ? `, +${more}` : ''})`;
	});
	return `${joinClauses(clauses)} rest${reading.total === 1 ? 's' : ''} on it.`;
}

/**
 * Read what rests on `nodeId` (a graph node id such as `feature:<id>` or
 * `entity:<id>`) from the project's knowledge graph. Throws when the graph
 * cannot be read, so the caller can say so rather than claim nothing rests
 * on the node.
 */
export async function fetchDependants(
	projectId: string,
	nodeId: string,
	fetchFn: typeof fetch = fetch
): Promise<DependantsReading> {
	const query = new URLSearchParams({
		projectId,
		focus: nodeId,
		depth: '1',
		direction: 'in'
	});
	const response = await fetchFn(`/api/graph?${query.toString()}`);
	if (!response.ok) throw new Error(`graph read failed (${response.status})`);
	const scoped = (await response.json()) as DependantsSource;
	return collectDependants(scoped, scoped.focusNodeId ?? nodeId);
}
