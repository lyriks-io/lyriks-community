import { MAX_IMPACT_DEPTH, type ImpactHypothesis, type ImpactNodeKind, type ImpactSection } from './enums';
import type { EvolutionRequest, ImpactFinding } from './draft';
import { stableId } from './ids';

/**
 * The impact report, computed: what moves when the touched features move.
 *
 * The specification says the propagation is computed over the knowledge graph
 * at a depth the reader chooses, under one hypothesis at a time (ac-evo-imp-2,
 * ac-evo-imp-7). Nothing here is guessed: a node is listed because a path of at
 * most `depth` links joins it to a touched feature, and the path is kept on the
 * row so the reader can see why it is there.
 *
 * The graph is taken structurally so this module owes nothing to the graph
 * provider: any node/edge set with kinds and labels will do.
 */
export interface PropagationNode {
	readonly id: string;
	readonly kind: string;
	readonly label: string;
	readonly context?: string;
}

export interface PropagationEdge {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
}

export interface PropagationGraph {
	readonly nodes: readonly PropagationNode[];
	readonly edges: readonly PropagationEdge[];
}

/** A glossary term, so the report can say which agreed words the change touches. */
export interface PropagationTerm {
	readonly id: string;
	readonly term: string;
	readonly synonymsAllowed?: readonly string[];
}

interface Placement {
	readonly section: ImpactSection;
	readonly nodeKind: ImpactNodeKind;
}

/**
 * Where a graph node kind lands in the report. A kind absent here is not part
 * of what the six sections describe (a host, a tech choice, a formal engine
 * site) and is left out rather than filed under the wrong heading.
 */
const PLACEMENT: Readonly<Record<string, Placement>> = {
	core: { section: 'leaves', nodeKind: 'core' },
	family: { section: 'leaves', nodeKind: 'core' },
	feature: { section: 'leaves', nodeKind: 'feature' },
	action: { section: 'leaves', nodeKind: 'action' },
	surface: { section: 'screens_and_journeys', nodeKind: 'screen' },
	screen: { section: 'screens_and_journeys', nodeKind: 'screen' },
	component: { section: 'screens_and_journeys', nodeKind: 'screen' },
	template: { section: 'screens_and_journeys', nodeKind: 'screen' },
	element: { section: 'screens_and_journeys', nodeKind: 'screen' },
	journey: { section: 'screens_and_journeys', nodeKind: 'journey' },
	step: { section: 'screens_and_journeys', nodeKind: 'journey' },
	database: { section: 'entities_and_fields', nodeKind: 'database' },
	entity: { section: 'entities_and_fields', nodeKind: 'entity' },
	field: { section: 'entities_and_fields', nodeKind: 'field' },
	rule: { section: 'rules_and_scenarios', nodeKind: 'rule' },
	state: { section: 'rules_and_scenarios', nodeKind: 'rule' },
	effect: { section: 'rules_and_scenarios', nodeKind: 'rule' },
	event: { section: 'rules_and_scenarios', nodeKind: 'rule' },
	scenario: { section: 'rules_and_scenarios', nodeKind: 'scenario' },
	issue: { section: 'rules_and_scenarios', nodeKind: 'issue' },
	role: { section: 'permissions', nodeKind: 'role' },
	persona: { section: 'permissions', nodeKind: 'role' },
	capability: { section: 'permissions', nodeKind: 'permission' }
};

/**
 * The kinds the walk never crosses (ac-evo-imp-8). A role reaches every feature
 * it may use, a core holds every feature under it, the project holds
 * everything: walking through one of them lists the product, not the change.
 * Such a node is reported when reached, and the walk stops there.
 */
const HUB_KINDS: ReadonlySet<string> = new Set([
	'project',
	'role',
	'persona',
	'capability',
	'core',
	'family',
	'release',
	'term'
]);

/** The graph ids a touched feature appears under: its Lyriks node and its behaviour node. */
export function touchedNodeIds(leafIds: readonly string[]): string[] {
	return leafIds.flatMap((id) => [`feature:${id}`, `feature:beh:${id}`]);
}

/** Under `remove` a knock-on is a high risk: what rested on the feature loses its ground. */
function severityOf(hypothesis: ImpactHypothesis, hops: number): ImpactFinding['severity'] {
	if (hops <= 1) return 'high';
	if (hypothesis === 'remove') return hops === 2 ? 'high' : 'medium';
	if (hops === 2) return 'medium';
	return 'low';
}

/** What happens to a rule (ac-evo-imp-12): replayed under add, rewritten once its ground changes. */
function ruleWorkOf(hypothesis: ImpactHypothesis, hops: number): ImpactFinding['ruleWork'] {
	if (hypothesis === 'add') return 'replay';
	if (hypothesis === 'change') return hops <= 1 ? 'rewrite' : 'replay';
	return 'rewrite';
}

/** Whether an entity that moves implies a data migration (ac-evo-imp-6, -12). */
function migrationOf(hypothesis: ImpactHypothesis, hops: number): boolean {
	if (hypothesis === 'add') return false;
	if (hypothesis === 'change') return hops <= 1;
	return true;
}

/**
 * What the code has to do on a reached node. Under `add` and `change` the
 * neighbours have to accommodate the change; under `remove` the direct
 * neighbours lose something and the rest is at risk. Nothing further out than
 * one link is ever said to need editing: it is listed as at risk, which is the
 * honest reading of a knock-on.
 */
function codeWorkOf(hypothesis: ImpactHypothesis, hops: number): ImpactFinding['codeWork'] {
	if (hops > 1) return 'at_risk';
	return hypothesis === 'remove' ? 'remove' : 'change';
}

const wordMatcher = (words: readonly string[]): RegExp | null => {
	const escaped = words
		.map((w) => w.trim())
		.filter((w) => w.length > 1)
		.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return escaped.length === 0 ? null : new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
};

export interface PropagationInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'leafIds'>;
	readonly hypothesis: ImpactHypothesis;
	readonly depth: number;
	/**
	 * The graph to walk. Under an overlay this is the graph WITH the request's
	 * drafts in it, so the walk starts from the change rather than from the hole
	 * where it would sit (ac-evo-ovl-1).
	 */
	readonly graph: PropagationGraph;
	readonly terms?: readonly PropagationTerm[];
	/**
	 * The graph ids that stand for a draft. A node reached from one of them is
	 * stamped `fromDraft`, so a reader is never left guessing whether a row is
	 * there because of what exists or because of what is being proposed.
	 */
	readonly draftNodeIds?: ReadonlySet<string>;
}

/**
 * Breadth-first over the graph, both directions, from every touched feature,
 * stopping at `depth` links. Each reached node becomes one finding under the
 * hypothesis, carrying the path that reached it.
 */
export function propagateImpact(input: PropagationInput): ImpactFinding[] {
	// Under add nothing that exists breaks: only the direct neighbourhood moves
	// (ac-evo-imp-12); knock-ons are a change or a removal thing.
	const depth =
		input.hypothesis === 'add' ? 1 : Math.max(1, Math.min(MAX_IMPACT_DEPTH, Math.floor(input.depth)));
	const byId = new Map(input.graph.nodes.map((n) => [n.id, n]));
	const adjacency = new Map<string, { to: string; kind: string }[]>();
	const link = (from: string, to: string, kind: string) => {
		const list = adjacency.get(from) ?? [];
		list.push({ to, kind });
		adjacency.set(from, list);
	};
	for (const edge of input.graph.edges) {
		link(edge.from, edge.to, edge.kind);
		link(edge.to, edge.from, edge.kind);
	}

	const starts = touchedNodeIds(input.request.leafIds).filter((id) => byId.has(id));
	const startSet = new Set(starts);
	interface Visit {
		readonly hops: number;
		readonly path: readonly string[];
		readonly via: string;
		/** True when the walk that reached this node started on a drafted feature. */
		readonly fromDraft: boolean;
	}
	const drafted = input.draftNodeIds ?? new Set<string>();
	const visited = new Map<string, Visit>();
	let frontier: { id: string; visit: Visit }[] = starts.map((id) => ({
		id,
		visit: { hops: 0, path: [], via: '', fromDraft: drafted.has(id) }
	}));
	for (const f of frontier) visited.set(f.id, f.visit);
	while (frontier.length > 0) {
		const next: { id: string; visit: Visit }[] = [];
		for (const { id, visit } of frontier) {
			if (visit.hops >= depth) continue;
			const here = byId.get(id);
			// A hub is a destination, never a path: the walk stops on it.
			if (visit.hops > 0 && here && HUB_KINDS.has(here.kind)) continue;
			for (const { to, kind } of adjacency.get(id) ?? []) {
				if (visited.has(to)) continue;
				const reached: Visit = {
					hops: visit.hops + 1,
					path: [...visit.path, here?.label ?? id],
					via: kind,
					fromDraft: visit.fromDraft
				};
				visited.set(to, reached);
				next.push({ id: to, visit: reached });
			}
		}
		frontier = next;
	}

	const findings: ImpactFinding[] = [];
	// A touched feature's own behaviour node is where it lives, not something it moves.
	const ownBehaviour = new Set(input.request.leafIds.map((id) => `feature:beh:${id}`));
	for (const id of drafted) ownBehaviour.add(id);
	for (const [id, visit] of visited) {
		if (startSet.has(id) || ownBehaviour.has(id)) continue;
		const node = byId.get(id);
		if (!node) continue;
		const placement = PLACEMENT[node.kind];
		if (!placement) continue;
		const isData = placement.section === 'entities_and_fields';
		const isRule = placement.section === 'rules_and_scenarios';
		findings.push({
			id: stableId('imp', input.request.id, input.hypothesis, id),
			hypothesis: input.hypothesis,
			section: placement.section,
			nodeId: id,
			nodeLabel: node.label,
			nodeKind: placement.nodeKind,
			groupPath: [...visit.path],
			note: `${node.kind} reached in ${visit.hops} ${visit.hops === 1 ? 'link' : 'links'} from ${visit.path[0] ?? 'the request'}, through "${visit.via}".`,
			codeWork: codeWorkOf(input.hypothesis, visit.hops),
			depth: visit.hops,
			severity: severityOf(input.hypothesis, visit.hops),
			migrationImplied: isData ? migrationOf(input.hypothesis, visit.hops) : null,
			ruleWork: isRule ? ruleWorkOf(input.hypothesis, visit.hops) : null,
			fromDraft: visit.fromDraft
		});
	}

	// The agreed words: a term that names a touched feature or a direct hit is a
	// term the change touches too. Knock-on labels are left out: matching "Project"
	// against every screen name would list the glossary, not the change.
	const labels = [
		...findings.filter((f) => f.depth <= 1).map((f) => f.nodeLabel),
		...starts.map((id) => byId.get(id)?.label ?? '')
	].join('\n');
	for (const term of input.terms ?? []) {
		const matcher = wordMatcher([term.term, ...(term.synonymsAllowed ?? [])]);
		if (!matcher || !matcher.test(labels)) continue;
		findings.push({
			id: stableId('imp', input.request.id, input.hypothesis, `term:${term.id}`),
			hypothesis: input.hypothesis,
			section: 'glossary_terms',
			nodeId: `term:${term.id}`,
			nodeLabel: term.term,
			nodeKind: 'term',
			groupPath: [],
			note: 'This agreed word names something the change moves; check the definition still holds.',
			codeWork: null,
			depth: 1,
			severity: 'low',
			migrationImplied: null,
			ruleWork: null
		});
	}

	const order: Record<ImpactSection, number> = {
		leaves: 0,
		screens_and_journeys: 1,
		entities_and_fields: 2,
		rules_and_scenarios: 3,
		permissions: 4,
		glossary_terms: 5,
		code: 6
	};
	return findings.sort(
		(a, b) =>
			order[a.section] - order[b.section] ||
			a.depth - b.depth ||
			a.nodeLabel.localeCompare(b.nodeLabel)
	);
}

/** The findings of `hypothesis` replaced by `findings`; the other hypotheses stay side by side. */
export function withImpactReading(
	request: EvolutionRequest,
	hypothesis: ImpactHypothesis,
	depth: number,
	findings: readonly ImpactFinding[],
	at: string
): EvolutionRequest {
	return {
		...request,
		impactReport: { status: 'ready', hypothesis, depth, ranAt: at },
		impactFindings: [
			...request.impactFindings.filter((f) => f.hypothesis !== hypothesis),
			...findings
		]
	};
}
