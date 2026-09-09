import { actionAssignmentKey, type ProjectFeaturesDraft } from './draft';

/**
 * Global feature-id preflight for imports/templates (MR 6).
 *
 * Feature ids must be unique within one project. When a project is instantiated from a
 * template (or two templates share a fixture), the same id can appear twice —
 * and because the id IS the on-disk kernel folder key, a collision silently
 * merges two different features. `detectDuplicateFeatureIds` finds them;
 * `remapFeatureIds` rewrites an id everywhere it is referenced so a rename is
 * complete and never strands a dangling reference.
 *
 * Every featureId reference in the draft is rewritten here — keep this in lockstep
 * with `ProjectFeaturesDraft`: Feature.id + Feature.unspaghettitFeatureId, MVP and
 * roadmap assignments, leafMeta keys + `dependsOn`, actionAssignment composite
 * keys.
 */

/** Feature ids that appear more than once in the draft's leaf set. */
export function detectDuplicateFeatureIds(draft: Pick<ProjectFeaturesDraft, 'features'>): string[] {
	const seen = new Set<string>();
	const dupes = new Set<string>();
	for (const f of draft.features) {
		if (seen.has(f.id)) dupes.add(f.id);
		seen.add(f.id);
	}
	return [...dupes];
}

/**
 * Rewrite feature ids per `idMap` across every reference. Ids absent from the map
 * are untouched. Returns a new draft; the input is not mutated.
 */
export function remapFeatureIds(draft: ProjectFeaturesDraft, idMap: ReadonlyMap<string, string>): ProjectFeaturesDraft {
	const map = (id: string): string => idMap.get(id) ?? id;

	return {
		...draft,
		features: draft.features.map((f) => ({ ...f, id: map(f.id), unspaghettitFeatureId: map(f.id) })),
		mvpAssignments: draft.mvpAssignments.map((m) => ({ ...m, featureId: map(m.featureId) })),
		roadmapAssignments: draft.roadmapAssignments.map((r) => ({ ...r, featureId: map(r.featureId) })),
		leafMeta: draft.leafMeta
			? Object.fromEntries(
					Object.entries(draft.leafMeta).map(([featureId, meta]) => [
						map(featureId),
						meta.dependsOn ? { ...meta, dependsOn: meta.dependsOn.map(map) } : meta
					])
				)
			: draft.leafMeta,
		actionAssignments: draft.actionAssignments
			? Object.fromEntries(
					Object.entries(draft.actionAssignments).map(([key, owner]) => {
						const [featureId, actionId] = key.split('::');
						return [actionId === undefined ? key : actionAssignmentKey(map(featureId), actionId), owner];
					})
				)
			: draft.actionAssignments
	};
}

/**
 * Preflight an imported draft: give every duplicated feature id (all occurrences
 * after the first) a fresh, unique id via `mintId`, rewriting all references.
 * Idempotent on an already-unique draft. Returns the cleaned draft and the map of
 * changes made (empty when nothing was duplicated).
 */
export function deduplicateFeatureIds(
	draft: ProjectFeaturesDraft,
	mintId: () => string
): { draft: ProjectFeaturesDraft; remapped: Record<string, string> } {
	const duplicates = new Set(detectDuplicateFeatureIds(draft));
	if (duplicates.size === 0) return { draft, remapped: {} };

	// Only the SECOND+ occurrence of a duplicated id is renamed; the first keeps it.
	// remapFeatureIds rewrites by id, so we rename per-feature by rebuilding the
	// feature list, then remap the ancillary references for the renamed ids.
	const used = new Set(draft.features.map((f) => f.id));
	const seen = new Set<string>();
	const remapped: Record<string, string> = {};
	const features = draft.features.map((f) => {
		if (!duplicates.has(f.id) || !seen.has(f.id)) {
			seen.add(f.id);
			return f;
		}
		let fresh = mintId();
		while (used.has(fresh)) fresh = mintId();
		used.add(fresh);
		remapped[f.id] = fresh; // note: last-writer wins for the report if >2 copies
		return { ...f, id: fresh, unspaghettitFeatureId: fresh };
	});

	// The ancillary references (assignments, leafMeta, etc.) are keyed by the OLD
	// id, which now belongs to the first (kept) occurrence — so they cannot be
	// safely reattached to a specific renamed copy. Rewriting the feature ids alone
	// keeps every renamed leaf a valid, unique shell; its assignments stay with the
	// original id (the kept copy). This is the safe, reference-complete outcome.
	return { draft: { ...draft, features }, remapped };
}
