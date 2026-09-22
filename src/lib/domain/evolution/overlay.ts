import type { CoherenceFinding, DraftLeaf, EvolutionRequest } from './draft';
import { isDraftLeafId } from './draft';
import type { PropagationGraph, PropagationNode, PropagationEdge } from './impact-propagation';
import { stableId } from './ids';

/**
 * The product as this request would leave it.
 *
 * The impact report, the coherence check and the prototype all read the
 * specification through this: the sections as they are, with the request's
 * drafts laid on top (ac-evo-ovl-1 to -3). Nothing here writes. An overlay is
 * built, read and thrown away, which is what lets a change be measured and
 * walked while it is still written nowhere (ac-evo-ovl-4).
 *
 * Exactly one request at a time: an overlay never carries two dossiers, because
 * two changes that have not been reconciled would produce a reading of a product
 * nobody has decided to build (ac-evo-ovl-6).
 */

/** The graph id a draft takes while it is only a draft. */
export const draftNodeId = (draftId: string): string => `feature:${draftId}`;

/**
 * The graph with the request's drafts in it.
 *
 * An addition becomes a real node with real edges, so the walk starts FROM the
 * new capability instead of from the hole where it would sit. An amendment and a
 * removal already have their node in the graph (they stand for a leaf that
 * exists); what the overlay adds for them is the new ground they would rest on,
 * because a dependency the change introduces is exactly what the reader needs
 * warned about.
 */
export function overlayGraph(
	graph: PropagationGraph,
	drafts: readonly DraftLeaf[]
): PropagationGraph {
	if (drafts.length === 0) return graph;
	const known = new Set(graph.nodes.map((n) => n.id));
	const nodes: PropagationNode[] = [];
	const edges: PropagationEdge[] = [];

	/** Where a draft sits in the graph: its own node when new, the leaf's when not. */
	const anchorOf = (draft: DraftLeaf): string =>
		draft.kind === 'add' ? draftNodeId(draft.id) : `feature:${draft.baseLeafId ?? draft.id}`;

	for (const draft of drafts) {
		const anchor = anchorOf(draft);
		if (draft.kind === 'add' && !known.has(anchor)) {
			nodes.push({
				id: anchor,
				kind: 'feature',
				label: draft.name || draft.id,
				context: 'Drafted by this request'
			});
			known.add(anchor);
			// The tree it would hang in. A core and a family are hubs, so the walk
			// reports them and stops, which is what keeps the report about the
			// change rather than about everything under the same core.
			if (draft.coreId) edges.push({ from: anchor, to: `core:${draft.coreId}`, kind: 'belongs_to' });
			if (draft.parentFamilyId)
				edges.push({ from: anchor, to: `family:${draft.parentFamilyId}`, kind: 'belongs_to' });
		}
		for (const dep of draft.dependsOn) {
			const target = isDraftLeafId(dep) ? draftNodeId(dep) : `feature:${dep}`;
			edges.push({ from: anchor, to: target, kind: 'depends_on' });
		}
	}

	// An edge to a node the graph does not hold reaches nothing, and pretending
	// otherwise would put a dangling row in the report.
	const reachable = new Set([...known, ...graph.nodes.map((n) => n.id)]);
	return {
		nodes: [...graph.nodes, ...nodes],
		edges: [...graph.edges, ...edges.filter((e) => reachable.has(e.from) && reachable.has(e.to))]
	};
}

/** The graph ids that stand for a draft, so a reading can say where it came from. */
export function draftNodeIds(drafts: readonly DraftLeaf[]): Set<string> {
	const ids = new Set<string>();
	for (const draft of drafts) {
		if (draft.kind !== 'add') continue;
		ids.add(draftNodeId(draft.id));
		ids.add(`feature:beh:${draft.id}`);
	}
	return ids;
}

/* ───────────────────────── Coherence, under the overlay ───────────────────────── */

export interface DraftCoherenceInput {
	readonly request: Pick<EvolutionRequest, 'id' | 'drafts' | 'leafIds'>;
	/** Every leaf of the tree, by id, so a collision can be named on both sides. */
	readonly leafNames: Readonly<Record<string, string>>;
	/** What each leaf depends on today, so a removal can be told what it breaks. */
	readonly dependsOn: Readonly<Record<string, readonly string[]>>;
	/** Words the glossary bans, with the agreed word to use instead. */
	readonly bannedWords?: readonly { avoid: string; prefer: string }[];
}

const norm = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The contradictions a change would INTRODUCE, read off its drafts.
 *
 * The coherence engine walks what exists, so it has nothing to say about a
 * capability that does not exist yet. These are the findings that only a draft
 * can produce, computed here and published beside the engine's own, which is
 * what ac-evo-ovl-2 asks for: a contradiction found before the change exists.
 */
export function draftCoherence(input: DraftCoherenceInput): CoherenceFinding[] {
	const findings: CoherenceFinding[] = [];
	const { request, leafNames, dependsOn } = input;
	const removed = new Set(
		request.drafts.filter((d) => d.kind === 'remove' && d.baseLeafId).map((d) => d.baseLeafId as string)
	);

	for (const draft of request.drafts) {
		const label = draft.name || draft.id;

		// A new capability called what something is already called. Two names for
		// one thing is the semantic fault the glossary exists to prevent.
		if (draft.kind === 'add' && draft.name.trim() !== '') {
			const clash = Object.entries(leafNames).find(([, name]) => norm(name) === norm(draft.name));
			if (clash)
				findings.push({
					id: stableId('coh-draft-name', request.id, draft.id, clash[0]),
					axis: 'semantic',
					severity: 'blocking',
					title: `"${draft.name}" is already the name of an existing feature`,
					requestNodeId: draftNodeId(draft.id),
					existingNodeId: `feature:${clash[0]}`,
					fixNowTarget: `features.leafMeta.${clash[0]}`,
					published: true
				});
		}

		// Resting on something the same request takes away.
		for (const dep of draft.dependsOn) {
			if (!removed.has(dep)) continue;
			findings.push({
				id: stableId('coh-draft-dep', request.id, draft.id, dep),
				axis: 'structural',
				severity: 'blocking',
				title: `"${label}" would rest on "${leafNames[dep] ?? dep}", which this same request removes`,
				requestNodeId: draftNodeId(draft.id),
				existingNodeId: `feature:${dep}`,
				fixNowTarget: `features.leafMeta.${dep}`,
				published: true
			});
		}

		// A removal that leaves dependents without ground.
		if (draft.kind === 'remove' && draft.baseLeafId) {
			for (const [leafId, deps] of Object.entries(dependsOn)) {
				if (leafId === draft.baseLeafId || !deps.includes(draft.baseLeafId)) continue;
				if (removed.has(leafId)) continue;
				findings.push({
					id: stableId('coh-draft-orphan', request.id, draft.id, leafId),
					axis: 'structural',
					severity: 'blocking',
					title: `"${leafNames[leafId] ?? leafId}" depends on "${leafNames[draft.baseLeafId] ?? draft.baseLeafId}", which this request removes`,
					requestNodeId: draftNodeId(draft.id),
					existingNodeId: `feature:${leafId}`,
					fixNowTarget: `features.leafMeta.${leafId}`,
					published: true
				});
			}
		}

		// A word the glossary bans, in the name or the description of the change.
		for (const banned of input.bannedWords ?? []) {
			const avoid = banned.avoid.trim();
			if (avoid.length < 2) continue;
			const pattern = new RegExp(`\\b${avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
			if (!pattern.test(`${draft.name} ${draft.description}`)) continue;
			findings.push({
				id: stableId('coh-draft-word', request.id, draft.id, avoid),
				axis: 'semantic',
				severity: 'major',
				title: `"${label}" uses "${avoid}", which the glossary asks to be called "${banned.prefer}"`,
				requestNodeId: draftNodeId(draft.id),
				existingNodeId: `term:${banned.prefer}`,
				fixNowTarget: 'glossary.terms',
				published: true
			});
			break;
		}

		// An addition nobody can test. Not a contradiction with the existing spec,
		// so it is worth knowing about without holding the request.
		if (draft.kind !== 'remove' && draft.acceptanceCriteria.length === 0)
			findings.push({
				id: stableId('coh-draft-untestable', request.id, draft.id),
				axis: 'functional',
				severity: 'minor',
				title: `"${label}" carries no acceptance criterion, so nothing says when it is done`,
				requestNodeId: draftNodeId(draft.id),
				existingNodeId: draftNodeId(draft.id),
				fixNowTarget: `evolution.${request.id}.drafts.${draft.id}`,
				published: true
			});
	}

	return findings;
}
