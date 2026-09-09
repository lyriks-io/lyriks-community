import { graphStats, nodeId, type GraphEdge, type GraphNodeKind, type KnowledgeGraph } from '$domain/graph';
import { isAuxFeatureId } from './projection/aux-feature-ids';

/**
 * Collapse the kernel's twin nodes out of a merged knowledge graph — one node
 * per concept.
 *
 * The behavior overlay re-projects Lyriks-authored artifacts under their kernel
 * identity: features, journeys/screens (as surfaces), steps/elements (as
 * actions), roles (as personas), databases/interfaces (as resources), and the
 * per-feature entity mirrors (`dataMirrorOps`). Each twin pair is already
 * declared by the projector as a `binds` edge (wizard node → kernel twin), so
 * every concept a user authored once used to render twice.
 *
 * This pure pass folds each twin into its wizard node, re-pointing every edge
 * at the surviving node:
 * - the `binds` edges are the collapse driver; entities/fields additionally
 *   match by normalized name so engine-authored duplicates of a canonical
 *   entity fold too;
 * - a Lyriks-minted entity/field mirror (`ent-*` / `fld-*` — see
 *   `projection/ownership.ts`) with NO canonical twin is a stale copy of a
 *   deleted entity and is dropped (the save path prunes it from the kernel on
 *   the next Data/Experience save);
 * - the generated aux features ("Data Model" / "Experience") are plumbing, not
 *   authored concepts: their node folds into the project root, their structure
 *   stays;
 * - a Lyriks-minted persona mirror (`per-*`) whose role is gone is stale and
 *   dropped, like a stale entity mirror;
 * - a `contains` edge whose target collapses into a node owned by another
 *   context (an entity, role, database, interface, journey, screen…) becomes a
 *   `uses` edge — consuming is not owning;
 * - hierarchy duplicates left by the fold (journey contains step twice, …) are
 *   deduped, wizard edge first;
 * - kernel-only nodes (engine-authored features/entities, states, events,
 *   rules, scenarios) have no twin and stay.
 */
export function collapseKernelTwins(graph: KnowledgeGraph): KnowledgeGraph {
	const BEH_ENTITY = 'entity:beh:';
	const BEH_FIELD = 'field:beh:';
	const norm = (s: string): string => s.trim().toLowerCase();

	const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
	const remap = new Map<string, string>();
	const dropped = new Set<string>();

	// ── 1. binds edges declare the twin pairs — the generic collapse driver ──
	for (const e of graph.edges) {
		if (e.kind !== 'binds') continue;
		if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
		if (!remap.has(e.to)) remap.set(e.to, e.from);
	}

	// ── 2. entities/fields: name fallback + stale-mirror drop ──
	const canonicalEntities = graph.nodes.filter(
		(n) => n.kind === 'entity' && n.context !== 'behavior'
	);
	const canonicalFieldIds = new Set(
		graph.nodes.filter((n) => n.kind === 'field' && n.context !== 'behavior').map((n) => n.id)
	);
	const entityIdByName = new Map<string, string>();
	for (const n of canonicalEntities) if (norm(n.label)) entityIdByName.set(norm(n.label), n.id);

	// canonical entity id → normalized field label → canonical field id
	const canonicalFieldsByEntity = new Map<string, Map<string, string>>();
	// behavior field id → its behavior entity id
	const behFieldParent = new Map<string, string>();
	for (const e of graph.edges) {
		if (e.kind !== 'contains') continue;
		if (canonicalFieldIds.has(e.to) && e.from.startsWith('entity:') && !e.from.startsWith(BEH_ENTITY)) {
			const byLabel = canonicalFieldsByEntity.get(e.from) ?? new Map<string, string>();
			const label = norm(nodeById.get(e.to)?.label ?? '');
			if (label) byLabel.set(label, e.to);
			canonicalFieldsByEntity.set(e.from, byLabel);
		}
		if (e.from.startsWith(BEH_ENTITY) && e.to.startsWith(BEH_FIELD)) behFieldParent.set(e.to, e.from);
	}

	if (canonicalEntities.length > 0) {
		for (const n of graph.nodes) {
			if (!n.id.startsWith(BEH_ENTITY) || remap.has(n.id)) continue;
			const raw = n.id.slice(BEH_ENTITY.length);
			const byName = entityIdByName.get(norm(n.label));
			if (byName) remap.set(n.id, byName);
			else if (raw.startsWith('ent-')) dropped.add(n.id); // stale copy of a deleted entity
		}
		for (const n of graph.nodes) {
			if (!n.id.startsWith(BEH_FIELD) || remap.has(n.id)) continue;
			const raw = n.id.slice(BEH_FIELD.length);
			const parent = behFieldParent.get(n.id);
			if (parent && dropped.has(parent)) {
				dropped.add(n.id); // its whole entity was a stale mirror
				continue;
			}
			const parentTarget = parent ? remap.get(parent) : undefined;
			const byName = parentTarget
				? canonicalFieldsByEntity.get(parentTarget)?.get(norm(n.label))
				: undefined;
			if (byName) remap.set(n.id, byName);
			else if (raw.startsWith('fld-') && parentTarget) dropped.add(n.id); // stale copy of a deleted field
		}
	}

	// ── aux features are plumbing: fold their node into the project root ──
	const BEH_FEATURE = 'feature:beh:';
	const rootId = nodeId('project', graph.projectId);
	if (nodeById.has(rootId)) {
		for (const n of graph.nodes) {
			if (n.id.startsWith(BEH_FEATURE) && isAuxFeatureId(n.id.slice(BEH_FEATURE.length))) {
				remap.set(n.id, rootId);
			}
		}
	}

	// ── stale persona mirrors (their role is gone): drop like entity mirrors ──
	if (graph.nodes.some((n) => n.kind === 'role')) {
		for (const n of graph.nodes) {
			if (n.id.startsWith('persona:beh:per-') && !remap.has(n.id)) dropped.add(n.id);
		}
	}

	if (remap.size === 0 && dropped.size === 0) return graph;

	// ── 3. rebuild: drop twins, re-point edges, demote consumed containment ──
	// Targets whose canonical container lives in another context: folding a
	// `contains` edge onto them would claim ownership the source doesn't have.
	const USES_TARGETS = new Set<GraphNodeKind>([
		'entity',
		'role',
		'database',
		'interface',
		'journey',
		'screen',
		'component',
		'template'
	]);
	const nodes = graph.nodes.filter((n) => !remap.has(n.id) && !dropped.has(n.id));
	const kept = new Set(nodes.map((n) => n.id));
	const seenPairs = new Set<string>();
	const edges: GraphEdge[] = [];
	for (const e of graph.edges) {
		const from = remap.get(e.from) ?? e.from;
		const to = remap.get(e.to) ?? e.to;
		if (from === to) continue; // e.g. the binds edge that declared the pair
		if (!kept.has(from) || !kept.has(to)) continue;
		const touched = from !== e.from || to !== e.to;
		const demote =
			e.kind === 'contains' &&
			remap.has(e.to) &&
			USES_TARGETS.has(nodeById.get(to)?.kind as GraphNodeKind) &&
			nodeById.get(from)?.kind !== 'project';
		const kind = demote ? 'uses' : e.kind;
		const pair = `${from}|${kind}|${to}`;
		if (touched && seenPairs.has(pair)) continue; // hierarchy already present (wizard edge first)
		seenPairs.add(pair);
		edges.push(touched || demote ? { ...e, from, to, kind } : e);
	}

	return { ...graph, nodes, edges, stats: graphStats(nodes, edges) };
}
