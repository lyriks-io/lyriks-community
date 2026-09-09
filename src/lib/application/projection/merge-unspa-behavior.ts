/**
 * Merge a fresh Lyriks projection of an Unspaghettit feature with the copy
 * already on disk, so re-syncing the wizard never destroys behavior authored in
 * the engine.
 *
 * Ownership (the project's "unspaghettit IS the behavioral engine" rule):
 *   - **Lyriks owns identity & structure** — surface/action/persona existence,
 *     names, descriptions, intents, transitions, emitted events, the `set_state`
 *     effects derived from builder wiring (id `eff-ui-*`), and the whole
 *     data-model resource/entity nodes. These always come from the projection.
 *   - **Unspaghettit owns behavioral depth** — state definitions, rules,
 *     invariants, action parameters, scenarios, action effects, and persona
 *     state/parameter overrides. Lyriks always projects these empty, so they are
 *     preserved from disk whenever present.
 *   - **Deletions propagate — but only on the features Lyriks owns end to end**
 *     (Experience, Data Model). There Lyriks owns which nodes exist, so a surface
 *     / action / persona the projection no longer produces (its journey / step /
 *     actor was removed) is dropped — depth without its structure is dead weight.
 *     A LEAF feature is unspa's, and the Core-bridge mirror only visits it to add
 *     its Core's journeys: there the merge is additive (`mergeMirrored*`), never
 *     destructive, or an unrelated Experience save would erase behavior nobody
 *     asked it to touch.
 *
 * Everything here is pure. Shapes are loose `Record<string, unknown>` because
 * the on-disk feature is an untyped wire object (see `$lib/unspa-schema`).
 *
 * Tombstones (MR 7): the additive mirrors keep engine content forever, which also
 * used to resurrect a Lyriks-owned node the user had deleted (the projection stops
 * producing it, but the additive merge kept the on-disk copy). Passing the set of
 * ids/names the user explicitly deleted lets the merge suppress exactly those —
 * and only if Lyriks owns them (`isTombstonable`), so a tombstone can never drop
 * engine depth. Omitting the set preserves the pre-MR-7 behavior.
 */

import { isLyriksOwned, isTombstonable } from './ownership';

type Node = Record<string, unknown>;

const asArray = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const idOf = (n: Node): string | undefined => {
	const id = (n as { id?: unknown }).id;
	return typeof id === 'string' ? id : undefined;
};
const nameOf = (n: Node): string => {
	const name = (n as { name?: unknown }).name;
	return typeof name === 'string' && name ? name : (idOf(n) ?? 'unnamed');
};

/** Prefer the engine's array when it carries content; else fall back to the projection's. */
const enginePreferred = (engine: unknown, projected: unknown): unknown =>
	Array.isArray(engine) && engine.length > 0 ? engine : projected;

/**
 * Project the node list onto Lyriks' set: keep exactly the ids the projection
 * produces, refreshing each via `merge` (which preserves engine-authored depth
 * on the matching on-disk node). Ids the projection no longer produces are
 * dropped — deletions in Lyriks propagate. `merge` runs even with no on-disk
 * match so node-level normalization (e.g. defaulting persona override arrays)
 * applies uniformly; merging against an empty node is idempotent.
 */
function mergeById(projected: Node[], existing: Node[], merge: (p: Node, e: Node) => Node): Node[] {
	const byId = new Map<string, Node>();
	for (const e of existing) {
		const id = idOf(e);
		if (id) byId.set(id, e);
	}
	return projected.map((p) => {
		const id = idOf(p);
		return merge(p, (id ? byId.get(id) : undefined) ?? {});
	});
}

/**
 * Ownership-aware merge for the features Lyriks only decorates (leaf mirrors).
 * Refreshes the nodes the projection produces, and for the on-disk nodes it does
 * NOT produce it applies the ownership rule instead of blindly keeping them all:
 *   - ENGINE-owned nodes (minted ids, no Lyriks prefix) are KEPT — the mirror is a
 *     visitor on someone else's feature and must never delete engine behavior.
 *   - LYRIKS-owned nodes (by id convention) are DROPPED — if Lyriks owns it and no
 *     longer projects it, the user deleted it, so it must not resurrect from disk.
 *     A stray explicit tombstone can additionally suppress a node, never an engine one.
 * Refreshed nodes come first (authored order); kept engine nodes follow.
 */
function additiveMergeById(
	projected: Node[],
	existing: Node[],
	merge: (p: Node, e: Node) => Node,
	tombstones?: ReadonlySet<string>
): Node[] {
	const projectedIds = new Set(projected.map(idOf).filter(Boolean) as string[]);
	const kept = existing.filter((e) => {
		const id = idOf(e);
		if (id === undefined) return true; // unattributable — keep
		if (projectedIds.has(id)) return false; // refreshed below
		if (tombstones?.has(id) && isTombstonable(id)) return false; // explicitly deleted
		return !isLyriksOwned(id); // keep engine content; drop deleted Lyriks-owned
	});
	return [...mergeById(projected, existing, merge), ...kept];
}

/**
 * Lyriks owns `emit_event` effects (derived from a step's operations) and the
 * `eff-ui-*` `set_state` effects (derived from builder transition wiring), so
 * both are refreshed from the projection — a removed operation drops its event,
 * an unwired button drops its state write. Engine-authored effects (minted ids,
 * any type) are preserved.
 */
function mergeEffects(projected: unknown, existing: unknown): Node[] {
	const fresh = asArray(projected);
	const freshIds = new Set(fresh.map(idOf).filter(Boolean) as string[]);
	const authored = asArray(existing).filter((e) => {
		const id = idOf(e);
		if ((e as { type?: unknown }).type === 'emit_event') return false;
		if (id === undefined) return true;
		return !freshIds.has(id) && !id.startsWith('eff-ui-');
	});
	return [...fresh, ...authored];
}

function mergeAction(projected: Node, existing: Node): Node {
	return {
		...projected,
		// engine-owned depth
		parameters: enginePreferred(existing.parameters, projected.parameters),
		requiredStates: enginePreferred(existing.requiredStates, projected.requiredStates),
		rules: enginePreferred(existing.rules, projected.rules),
		invariants: enginePreferred(existing.invariants, projected.invariants),
		effects: mergeEffects(projected.effects, existing.effects),
		...(existing.scenarios !== undefined ? { scenarios: existing.scenarios } : {})
	};
}

/**
 * A state definition Lyriks projects (a field's state, a seed) is refreshed from
 * the projection on every save: its type, path, seed value and validations are
 * Lyriks' to decide, and a seed that changes type must land. Whatever the
 * engine added on top of it (a shared scope, a description, an enum) survives.
 * Keeping the on-disk array wholesale, as before, froze the first projection
 * forever: a seed re-typed from string to number never reached the kernel.
 */
function mergeStateDefinition(projected: Node, existing: Node): Node {
	return { ...existing, ...projected };
}

function mergeSurface(projected: Node, existing: Node): Node {
	return {
		...projected,
		// Lyriks-owned state definitions refreshed, engine-owned ones kept.
		stateDefinitions: additiveMergeById(
			asArray(projected.stateDefinitions),
			asArray(existing.stateDefinitions),
			mergeStateDefinition
		),
		// engine-owned depth on the surface itself
		rules: enginePreferred(existing.rules, projected.rules),
		invariants: enginePreferred(existing.invariants, projected.invariants),
		// Refresh projected actions, drop deleted Lyriks-owned actions and preserve
		// engine-owned actions that have no editable Lyriks counterpart.
		actions: additiveMergeById(asArray(projected.actions), asArray(existing.actions), mergeAction)
	};
}

function mergePersona(projected: Node, existing: Node): Node {
	return {
		...projected,
		stateOverrides: Array.isArray(existing.stateOverrides) ? existing.stateOverrides : [],
		parameterOverrides: Array.isArray(existing.parameterOverrides)
			? existing.parameterOverrides
			: [],
		...(existing.persistAcrossSurfaces !== undefined
			? { persistAcrossSurfaces: existing.persistAcrossSurfaces }
			: {})
	};
}

/** Refresh projected surfaces, propagate Lyriks deletions and preserve engine-owned surfaces. */
export function mergeSurfaces(projected: unknown, existing: unknown): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), mergeSurface);
}

/** Refresh projected personas, propagate Lyriks deletions and preserve engine-owned personas. */
export function mergePersonas(projected: unknown, existing: unknown): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), mergePersona);
}

/**
 * Core-bridge mirror: refresh the journey surfaces this leaf's Core projects and
 * KEEP everything the leaf authored in unspa. The mirror is a visitor on someone
 * else's feature — it may add and refresh, never delete.
 */
export function mergeMirroredSurfaces(
	projected: unknown,
	existing: unknown,
	tombstones?: ReadonlySet<string>
): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), mergeSurface, tombstones);
}

/** Core-bridge mirror: same additive contract as `mergeMirroredSurfaces`, for personas. */
export function mergeMirroredPersonas(
	projected: unknown,
	existing: unknown,
	tombstones?: ReadonlySet<string>
): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), mergePersona, tombstones);
}

/**
 * Core-bridge mirror: same additive contract, for events. Events carry no stable
 * id across a re-projection (Lyriks mints them per save), so identity is the
 * event NAME — which is what an effect references anyway.
 */
export function mergeMirroredEvents(
	projected: unknown,
	existing: unknown,
	tombstonedNames?: ReadonlySet<string>
): Node[] {
	const fresh = asArray(projected);
	const names = new Set(fresh.map(nameOf));
	return [
		...fresh,
		...asArray(existing).filter((e) => {
			const name = nameOf(e);
			// Events are name-identified and always Lyriks-projected on a mirror, so a
			// tombstoned name suppresses the kept copy the user deleted.
			return !names.has(name) && !tombstonedNames?.has(name);
		})
	];
}

/**
 * Data-model mirror: same additive contract, for the entities lifted onto a leaf.
 * Lyriks owns the entities its Data section projects; an entity authored on the
 * leaf in unspa is none of its business and must survive the save.
 */
export function mergeMirroredEntities(
	projected: unknown,
	existing: unknown,
	tombstones?: ReadonlySet<string>
): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), (p) => p, tombstones);
}

/**
 * Data-model mirror: same additive contract, for the backing resources lifted
 * onto a leaf. Lyriks owns the `res-db-*` / `res-if-*` rows it projects; a
 * resource authored on the leaf in unspa survives, a Lyriks-owned one the
 * projection no longer produces is pruned with its entity.
 */
export function mergeMirroredResources(
	projected: unknown,
	existing: unknown,
	tombstones?: ReadonlySet<string>
): Node[] {
	return additiveMergeById(asArray(projected), asArray(existing), (p) => p, tombstones);
}

/** Preserve the engine's feature-level invariants when the projection has none. */
export function mergeFeatureInvariants(projected: unknown, existing: unknown): unknown {
	return enginePreferred(existing, projected);
}

/**
 * State paths declared on the surviving surfaces, plus the simulator clock
 * path, mirroring the engine validator's "any-surface" path set.
 */
function declaredStatePaths(surfaces: readonly Node[]): Set<string> {
	const paths = new Set<string>(['clock.now']);
	for (const surface of surfaces) {
		for (const def of asArray(surface.stateDefinitions)) {
			const path = (def as { path?: unknown }).path;
			if (typeof path === 'string') paths.add(path);
		}
	}
	return paths;
}

/** Every state path a condition tree references (leaf `left`, expression `path`). */
function conditionStatePaths(node: unknown, out: string[] = []): string[] {
	if (Array.isArray(node)) {
		for (const item of node) conditionStatePaths(item, out);
		return out;
	}
	if (node === null || typeof node !== 'object') return out;
	const record = node as Record<string, unknown>;
	for (const [key, value] of Object.entries(record)) {
		if ((key === 'left' || key === 'path') && typeof value === 'string') {
			out.push(value);
			continue;
		}
		conditionStatePaths(value, out);
	}
	return out;
}

/**
 * Drop reachability goals whose condition references a state path no surviving
 * surface declares. A save on a Lyriks-owned feature can legitimately drop a
 * surface (its screen or journey step was deleted), and this projection path
 * never runs the engine validator, so without the prune the goal stayed
 * behind dangling: `verify` reported it "never reached within bounds" (which
 * reads as a spec problem, not a deletion) and the engine flagged it on every
 * later read. Goals whose paths all survive are untouched: they are
 * engine-authored depth.
 */
export function pruneOrphanedReachabilityGoals(
	goals: unknown,
	surfaces: readonly Node[]
): unknown {
	if (!Array.isArray(goals) || goals.length === 0) return goals;
	const declared = declaredStatePaths(surfaces);
	return (goals as Node[]).filter((goal) =>
		conditionStatePaths((goal as { condition?: unknown }).condition).every((path) =>
			declared.has(path)
		)
	);
}
