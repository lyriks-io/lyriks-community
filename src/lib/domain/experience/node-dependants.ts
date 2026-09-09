import {
	descendantIds,
	fieldStatePath,
	isFieldBuilderKind,
	STATE_EFFECT_KINDS,
	type BuilderElementNode,
	type BuilderGroupNode,
	type BuilderNode,
	type ExperienceBuilder
} from './builder';
import { hostedSurfacesResolver } from './surface-hosting';

/**
 * What breaks if a node leaves the prototype.
 *
 * A screen element is rarely alone: an input provides a state path that a
 * button's visibility reads, a scenario asserts, a list filters on; a tab group
 * provides the path its panels switch on. Deleting the provider used to leave
 * every reader pointing at a path nothing defines, which the formal engine later
 * reports as a broken gluing condition. This computes those readers BEFORE the
 * deletion, so the person can be told "you are breaking a connection to X" and
 * decide with their eyes open. Pure: reads the builder document only.
 */
export type DependantKind =
	| 'binding'
	| 'visibility'
	| 'guard'
	| 'scenario'
	| 'listFilter'
	| 'optionsFilter'
	| 'tabs'
	| 'label'
	| 'seed';

export interface NodeDependant {
	/** The reading node; empty for a state seed (the document itself). */
	nodeId: string;
	surfaceId: string;
	label: string;
	kind: DependantKind;
	/** The state path that ties the reader to what is being removed. */
	path: string;
	/** The reader renders on another screen than the removed node. */
	offSurface: boolean;
}

export interface NodeDeletionImpact {
	/** The node and its whole subtree. */
	removedNodeIds: string[];
	/** State paths the subtree provides (writes or owns). */
	providedPaths: string[];
	dependants: NodeDependant[];
	offSurfaceDependants: NodeDependant[];
}

const TOKEN = /\{([A-Za-z_][\w.]*)\}/g;

/** Paths an element provides: the field it owns, the states its effects write. */
function providedByElement(el: BuilderElementNode): string[] {
	const out: string[] = [];
	if (isFieldBuilderKind(el.elementKind)) out.push(fieldStatePath(el));
	else if (el.wiring.binding?.targetKind === 'state' && el.wiring.binding.targetRef)
		out.push(el.wiring.binding.targetRef);
	for (const t of el.wiring.transitions) {
		const e = t.effect;
		if ((STATE_EFFECT_KINDS.includes(e.kind) || e.kind === 'selectRecord') && e.target) out.push(e.target);
		if (e.call) {
			for (const p of [e.call.loadingPath, e.call.resultPath, e.call.errorPath]) if (p) out.push(p);
		}
	}
	return out;
}

function providedByGroup(g: BuilderGroupNode): string[] {
	return g.presentation === 'tabs' ? [g.tabsKey || `tabs.${g.id}`] : [];
}

const refers = (ref: string | undefined | null, paths: readonly string[]): string | undefined => {
	if (!ref) return undefined;
	return paths.find((p) => ref === p || ref.startsWith(`${p}.`));
};

/** Every state path a surviving node reads, with what kind of reading it is. */
function readsOf(node: BuilderNode): { kind: DependantKind; ref: string }[] {
	const out: { kind: DependantKind; ref: string }[] = [];
	if (node.kind === 'group') {
		if (node.visibleWhen?.path) out.push({ kind: 'visibility', ref: node.visibleWhen.path });
		if (node.presentation === 'tabs') out.push({ kind: 'tabs', ref: node.tabsKey || `tabs.${node.id}` });
		for (const m of node.label.matchAll(TOKEN)) out.push({ kind: 'label', ref: m[1] });
		return out;
	}
	const w = node.wiring;
	// An input's own binding is what it provides, not something it depends on.
	if (!isFieldBuilderKind(node.elementKind) && w.binding?.targetKind === 'state' && w.binding.targetRef)
		out.push({ kind: 'binding', ref: w.binding.targetRef });
	if (w.visibleWhen?.path) out.push({ kind: 'visibility', ref: w.visibleWhen.path });
	for (const t of w.transitions) if (t.when?.path) out.push({ kind: 'guard', ref: t.when.path });
	for (const sc of w.scenarios) {
		for (const a of [...sc.given, ...sc.then]) if (a.path) out.push({ kind: 'scenario', ref: a.path });
	}
	if (node.filterStatePath) out.push({ kind: 'listFilter', ref: node.filterStatePath });
	if (node.optionsFrom?.filterPath) out.push({ kind: 'optionsFilter', ref: node.optionsFrom.filterPath });
	for (const m of node.label.matchAll(TOKEN)) out.push({ kind: 'label', ref: m[1] });
	return out;
}

export function nodeDeletionImpact(b: ExperienceBuilder, nodeId: string): NodeDeletionImpact {
	const target = b.nodes[nodeId];
	if (!target) return { removedNodeIds: [], providedPaths: [], dependants: [], offSurfaceDependants: [] };
	const removedNodeIds = [nodeId, ...descendantIds(b, nodeId)];
	const removed = new Set(removedNodeIds);
	const providedPaths = [
		...new Set(
			removedNodeIds.flatMap((id) => {
				const n = b.nodes[id];
				return !n ? [] : n.kind === 'group' ? providedByGroup(n) : providedByElement(n);
			})
		)
	];
	if (providedPaths.length === 0) return { removedNodeIds, providedPaths, dependants: [], offSurfaceDependants: [] };

	// "Same screen" widens through hosted components: a reader inside a card
	// component the same screen hosts is not on another screen.
	const hosted = hostedSurfacesResolver(b.nodes);
	const sameSurface = (surfaceId: string) =>
		surfaceId === target.surfaceId ||
		hosted(target.surfaceId).has(surfaceId) ||
		hosted(surfaceId).has(target.surfaceId);

	const dependants: NodeDependant[] = [];
	const seen = new Set<string>();
	for (const node of Object.values(b.nodes)) {
		if (removed.has(node.id)) continue;
		for (const r of readsOf(node)) {
			const path = refers(r.ref, providedPaths);
			if (!path) continue;
			const key = `${node.id}:${r.kind}:${r.ref}`;
			if (seen.has(key)) continue;
			seen.add(key);
			dependants.push({
				nodeId: node.id,
				surfaceId: node.surfaceId,
				label: node.label || (node.kind === 'element' ? node.elementKind : 'Group'),
				kind: r.kind,
				path: r.ref,
				offSurface: !sameSurface(node.surfaceId)
			});
		}
	}
	for (const seed of b.stateSeeds) {
		if (refers(seed.path, providedPaths))
			dependants.push({ nodeId: '', surfaceId: '', label: 'State seed', kind: 'seed', path: seed.path, offSurface: false });
	}
	return {
		removedNodeIds,
		providedPaths,
		dependants,
		offSurfaceDependants: dependants.filter((d) => d.offSurface)
	};
}
