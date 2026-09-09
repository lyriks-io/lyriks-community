import type { GraphEdge, GraphEdgeKind } from '$domain/graph';

export interface EdgePresentation {
	readonly label: string;
	readonly description: string;
	readonly color: string;
	readonly dash: string;
}

const EDGE_PRESENTATION: Record<GraphEdgeKind, EdgePresentation> = {
	contains: {
		label: 'Contains',
		description: 'Structural ownership or hierarchy',
		color: '#64748b',
		dash: '2 5'
	},
	performs: {
		label: 'Performs',
		description: 'A role performs a journey',
		color: '#a78bfa',
		dash: ''
	},
	accesses: {
		label: 'Accesses',
		description: 'A role can access a capability, feature, or journey',
		color: '#60a5fa',
		dash: ''
	},
	shows: {
		label: 'Shows',
		description: 'A journey step shows a screen',
		color: '#22d3ee',
		dash: ''
	},
	uses: {
		label: 'Uses',
		description: 'A screen uses a component or template',
		color: '#2dd4bf',
		dash: ''
	},
	reads: {
		label: 'Reads',
		description: 'A journey step consumes a data entity',
		color: '#34d399',
		dash: '7 3'
	},
	writes: {
		label: 'Writes',
		description: 'An action, parameter, or effect writes state or data',
		color: '#10b981',
		dash: ''
	},
	relates: {
		label: 'Relates to',
		description: 'A data entity references another entity',
		color: '#4ade80',
		dash: '7 3'
	},
	scheduled: {
		label: 'Scheduled for',
		description: 'A feature is assigned to a release',
		color: '#fbbf24',
		dash: '5 4'
	},
	derives: {
		label: 'Derived from',
		description: 'A rule is derived from a source artefact',
		color: '#fb923c',
		dash: '5 4'
	},
	flags: {
		label: 'Flags',
		description: 'A coherence gap flags the object it concerns',
		color: '#f87171',
		dash: '3 3'
	},
	hasSite: {
		label: 'Has site',
		description: 'A formal function or bus owns a site',
		color: '#c084fc',
		dash: ''
	},
	typedBy: {
		label: 'Typed by',
		description: 'A formal site is typed by a resource',
		color: '#d8b4fe',
		dash: '6 3'
	},
	connects: {
		label: 'Connects',
		description: 'One formal site connects to another',
		color: '#e879f9',
		dash: ''
	},
	hasBody: {
		label: 'Has body',
		description: 'A formal function owns a graph body',
		color: '#818cf8',
		dash: '6 3'
	},
	inherits: {
		label: 'Inherits',
		description: 'A formal resource inherits from another resource',
		color: '#a3e635',
		dash: '7 3'
	},
	emits: {
		label: 'Emits',
		description: 'A behavior action emits an event',
		color: '#f472b6',
		dash: '7 3'
	},
	binds: {
		label: 'Canonical binding',
		description: 'A Lyriks object and its Unspaghettit counterpart share a stable identity',
		color: '#8b5cf6',
		dash: ''
	},
	transitions: {
		label: 'Transitions to',
		description: 'A behavior action or surface transitions to another surface',
		color: '#06b6d4',
		dash: ''
	},
	tests: {
		label: 'Tests',
		description: 'A scenario exercises an action, rule, or state',
		color: '#f59e0b',
		dash: '5 3'
	},
	triggers: {
		label: 'Triggers',
		description: 'An emitted event triggers a behavior action',
		color: '#ec4899',
		dash: ''
	},
	guards: {
		label: 'Guards',
		description: 'A formal verdict guards the behavior it concerns',
		color: '#fb7185',
		dash: '3 3'
	}
};

export interface EdgeKindSummary extends EdgePresentation {
	readonly kind: GraphEdgeKind;
	readonly count: number;
}

export function edgePresentation(kind: GraphEdgeKind): EdgePresentation {
	return EDGE_PRESENTATION[kind];
}

export function summarizeEdgeKinds(edges: readonly GraphEdge[]): EdgeKindSummary[] {
	const counts = new Map<GraphEdgeKind, number>();
	for (const edge of edges) counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);

	return (Object.keys(EDGE_PRESENTATION) as GraphEdgeKind[])
		.filter((kind) => counts.has(kind))
		.map((kind) => ({ kind, count: counts.get(kind) ?? 0, ...EDGE_PRESENTATION[kind] }));
}
