import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';
import type { ProjectDataDraft } from '$domain/data';
import { isAuxFeatureId } from './projection/aux-feature-ids';
import {
	resourceAccessModeLabel,
	resourceAuthLabel,
	resourceKindLabel,
	resourceScopeLabel,
	resourceSensitivityLabel
} from './projection/resource-vocabulary';

/**
 * Reconcile the RESOURCES the behavior kernel holds against the infra map.
 *
 * Why this exists: the Data section's projection reads the kernel's `entities[]`
 * back but never its `resources[]`, and it only ever looks at the one aux "Data
 * Model" feature. The round-trip is therefore one-way. Lyriks pushes its
 * databases and interfaces out as `res-db-*` / `res-if-*`, while a resource
 * authored in the behavior editor (or by an agent, on any leaf feature) stays
 * invisible in Lyriks, as does one whose map object was deleted while a stale
 * mirror kept it in the kernel.
 *
 * The answer is a RECONCILIATION, not a second inventory: every row already on
 * the map is counted and dismissed in one line, and only what the map cannot
 * show is listed. Duplicating the map here would just be a worse copy of it.
 *
 * Read-only, and never round-tripped into the data residue: the map stays the
 * authoring surface for what Lyriks owns. Same contract as `index-feature-rules`,
 * for the same reason. Folding engine content into an editable draft would mint a
 * duplicate on the next save.
 *
 * Pure and framework-free. It only walks the persisted snapshots the
 * `BehaviorPort` read side already returns.
 */

/** Which side of the boundary a resource came from. */
export type ResourceOwnership =
	/** Projected out of the Lyriks infra map (`res-db-*`), authored as a database. */
	| { kind: 'database'; draftId: string }
	/** Projected out of the Lyriks infra map (`res-if-*`), authored as an interface. */
	| { kind: 'interface'; draftId: string }
	/** Declared in the behavior model itself: read-only here, edited in the editor. */
	| { kind: 'behavior' };

export interface KernelResource {
	/** Raw kernel resource id, unique across the project. */
	id: string;
	name: string;
	description: string;
	/** Raw code + display label, so a row renders even for a code we don't know. */
	kind: string;
	kindLabel: string;
	provider: string;
	scope: string;
	scopeLabel: string;
	location: string;
	/** Structural identity, read through the kind's terminology (db / table / column). */
	database: string;
	container: string;
	sensitivity: string;
	sensitivityLabel: string;
	containsPii: boolean;
	complianceTags: string[];
	accessModeLabel: string;
	authLabel: string;
	encryptionAtRest: boolean;
	encryptionInTransit: boolean;
	retention: string;
	owner: string;
	/** Where it came from. */
	ownership: ResourceOwnership;
	/**
	 * Whether the infra map still holds the object this row came from. False for a
	 * behavior-authored resource AND for a projected one whose map object is gone;
	 * either way the map cannot show it, which is what the panel lists.
	 */
	onMap: boolean;
	/** Features that declare it, in project order. A mirrored resource has several. */
	declaredBy: { featureId: string; featureName: string }[];
}

export interface KernelResourcesReadModel {
	resources: KernelResource[];
	total: number;
	/** How many the infra map already shows: counted, never re-listed. */
	onMap: number;
	/** Carries personal data, whichever side declared it. */
	withPii: number;
	/** True when the kernel answered at all, separating "none" from "unavailable". */
	hasProject: boolean;
}

export const EMPTY_KERNEL_RESOURCES: KernelResourcesReadModel = {
	resources: [],
	total: 0,
	onMap: 0,
	withPii: 0,
	hasProject: false
};

const RES_DB_PREFIX = 'res-db-';
const RES_IF_PREFIX = 'res-if-';

type Node = Record<string, unknown>;
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => v === true;
const node = (v: unknown): Node => (v ?? {}) as Node;
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && !!t) : [];

/**
 * Resolve a kernel resource id to the Lyriks object it was projected from, using
 * the write side's id conventions (`data-projection`), and say whether that object
 * is still on the map.
 */
function resolveOwnership(
	id: string,
	data: ProjectDataDraft | null
): { ownership: ResourceOwnership; onMap: boolean } {
	if (id.startsWith(RES_DB_PREFIX)) {
		const draftId = id.slice(RES_DB_PREFIX.length);
		return {
			ownership: { kind: 'database', draftId },
			onMap: !!data?.databases.some((d) => d.id === draftId)
		};
	}
	if (id.startsWith(RES_IF_PREFIX)) {
		const draftId = id.slice(RES_IF_PREFIX.length);
		return {
			ownership: { kind: 'interface', draftId },
			onMap: !!data?.interfaces.some((i) => i.id === draftId)
		};
	}
	return { ownership: { kind: 'behavior' }, onMap: false };
}

/** Project one raw kernel resource node into a row. */
function projectResource(raw: Node, data: ProjectDataDraft | null): KernelResource | null {
	const id = str(raw.id);
	if (!id) return null;
	const kind = str(raw.kind);
	const scope = str(raw.scope);
	const sensitivity = str(raw.sensitivity);
	const { ownership, onMap } = resolveOwnership(id, data);
	return {
		id,
		name: str(raw.name) || id,
		description: str(raw.description),
		kind,
		kindLabel: resourceKindLabel(kind),
		provider: str(raw.provider),
		scope,
		scopeLabel: resourceScopeLabel(scope),
		location: str(raw.location),
		database: str(raw.database),
		container: str(raw.container),
		sensitivity,
		sensitivityLabel: resourceSensitivityLabel(sensitivity),
		containsPii: bool(raw.containsPii),
		complianceTags: strList(raw.complianceTags),
		accessModeLabel: resourceAccessModeLabel(str(raw.accessMode)),
		authLabel: resourceAuthLabel(str(raw.authentication)),
		encryptionAtRest: bool(raw.encryptionAtRest),
		encryptionInTransit: bool(raw.encryptionInTransit),
		retention: str(raw.retention),
		owner: str(raw.owner),
		ownership,
		onMap,
		declaredBy: []
	};
}

/**
 * Build the reconciliation: every resource every feature declares, deduped by
 * kernel id (the Core-bridge mirror copies one resource onto every consuming
 * leaf, so the same id legitimately appears many times) and carrying the features
 * that declare it.
 *
 * Order is reader-first: what the map cannot show comes first, then the rest,
 * each group alphabetical.
 */
export function indexFeatureResources(
	project: UnspaProjectSnapshot | null,
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>,
	data: ProjectDataDraft | null
): KernelResourcesReadModel {
	const order = project?.project.featureIds ?? featureSnapshots.map((f) => f.featureId);
	const bySnap = new Map(featureSnapshots.map((f) => [f.featureId, f.snapshot]));
	// Product leaves first, aux features last, so `declaredBy` names the feature a
	// reader recognises before the generated "Data Model" one.
	const ordered = [...order].sort((a, b) => Number(isAuxFeatureId(a)) - Number(isAuxFeatureId(b)));

	const byId = new Map<string, KernelResource>();
	for (const featureId of ordered) {
		if (!bySnap.has(featureId)) continue;
		const feature = node(bySnap.get(featureId)?.feature);
		const featureName = str(feature.name) || featureId;
		for (const raw of arr(feature.resources)) {
			const id = str(raw.id);
			if (!id) continue;
			const existing = byId.get(id);
			if (existing) {
				existing.declaredBy.push({ featureId, featureName });
				continue;
			}
			const row = projectResource(raw, data);
			if (!row) continue;
			row.declaredBy.push({ featureId, featureName });
			byId.set(id, row);
		}
	}

	const resources = [...byId.values()].sort((a, b) => {
		const rank = Number(a.onMap) - Number(b.onMap);
		return rank !== 0 ? rank : a.name.localeCompare(b.name);
	});

	return {
		resources,
		total: resources.length,
		onMap: resources.filter((r) => r.onMap).length,
		withPii: resources.filter((r) => r.containsPii).length,
		hasProject: project !== null
	};
}
