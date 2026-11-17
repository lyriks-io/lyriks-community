import type { Family, Feature, ProjectFeaturesDraft } from './draft';

/**
 * Pure tree-walk helpers. Used by the UI to render Core → Family → Feature
 * and by the Features projection (`featuresDraftToBehaviorOps`) to enumerate the
 * leaf set (which becomes the project's `featureIds[]`).
 */

/** Features that live directly under a Core (no family in between). */
export function featuresDirectlyUnderCore(
	draft: ProjectFeaturesDraft,
	coreId: string
): Feature[] {
	// `!parentFamilyId` (not `=== null`) so a leaf whose field is undefined —
	// e.g. authored via the MCP without an explicit null — still counts as
	// directly-under-core instead of vanishing.
	return draft.features.filter((f) => f.coreId === coreId && !f.parentFamilyId);
}

/** Families that live directly under a Core. */
export function familiesDirectlyUnderCore(
	draft: ProjectFeaturesDraft,
	coreId: string
): Family[] {
	return draft.families.filter((f) => f.coreId === coreId && !f.parentFamilyId);
}

/** Features directly under a Family (no deeper family). */
export function featuresDirectlyUnderFamily(
	draft: ProjectFeaturesDraft,
	familyId: string
): Feature[] {
	return draft.features.filter((f) => f.parentFamilyId === familyId);
}

export function subFamiliesOf(draft: ProjectFeaturesDraft, familyId: string): Family[] {
	return draft.families.filter((f) => f.parentFamilyId === familyId);
}

// The tree reads in the app's alphabetical order (criterion 7b327ca1), one law for every list (criterion 4b3d2b4d).
export { sortByName } from '../shared/alphabetical';

/** Build the family-path string for a leaf, e.g. "Billing/Recurring". */
export function familyPathOf(draft: ProjectFeaturesDraft, leaf: Feature): string {
	if (!leaf.parentFamilyId) return '';
	const segments: string[] = [];
	let current = draft.families.find((f) => f.id === leaf.parentFamilyId) ?? null;
	while (current) {
		segments.unshift(current.name || '<unnamed>');
		current = current.parentFamilyId
			? draft.families.find((f) => f.id === current!.parentFamilyId) ?? null
			: null;
	}
	return segments.join('/');
}

/**
 * Every leaf Feature in the tree — IS the project's Unspaghettit `featureIds[]`.
 * Order matches insertion order in the draft.
 */
export function leafFeatures(draft: ProjectFeaturesDraft): Feature[] {
	return [...draft.features];
}

/**
 * Recursively collect all feature ids reachable from a starting family
 * (transitive). Used by cascade-delete.
 */
export function featureIdsUnderFamily(
	draft: ProjectFeaturesDraft,
	familyId: string
): string[] {
	const out: string[] = [];
	const queue = [familyId];
	while (queue.length > 0) {
		const fid = queue.shift()!;
		for (const f of draft.features) {
			if (f.parentFamilyId === fid) out.push(f.id);
		}
		for (const sub of draft.families) {
			if (sub.parentFamilyId === fid) queue.push(sub.id);
		}
	}
	return out;
}

/** Family ids transitively under a family (includes self). */
export function familyIdsUnderFamily(
	draft: ProjectFeaturesDraft,
	familyId: string
): string[] {
	const out = [familyId];
	const queue = [familyId];
	while (queue.length > 0) {
		const fid = queue.shift()!;
		for (const sub of draft.families) {
			if (sub.parentFamilyId === fid) {
				out.push(sub.id);
				queue.push(sub.id);
			}
		}
	}
	return out;
}

/** Family ids transitively under a Core (top-level + nested). */
export function familyIdsUnderCore(draft: ProjectFeaturesDraft, coreId: string): string[] {
	const top = draft.families.filter((f) => f.coreId === coreId && !f.parentFamilyId);
	const out: string[] = [];
	for (const t of top) out.push(...familyIdsUnderFamily(draft, t.id));
	return out;
}

/** Feature ids whose top ancestor is the given Core. */
export function featureIdsUnderCore(draft: ProjectFeaturesDraft, coreId: string): string[] {
	return draft.features.filter((f) => f.coreId === coreId).map((f) => f.id);
}

/**
 * What unfolding a grouping (a core or a family) also opens: while it holds
 * exactly one thing, that thing, and so on down to the first level with a real
 * choice. Ends on the lone feature when the path reaches one, so its actions
 * show with it.
 */
export function lonePathBelow(
	draft: ProjectFeaturesDraft,
	grouping: { coreId: string } | { familyId: string }
): { familyIds: string[]; featureId: string | null } {
	const familyIds: string[] = [];
	let features =
		'coreId' in grouping
			? featuresDirectlyUnderCore(draft, grouping.coreId)
			: featuresDirectlyUnderFamily(draft, grouping.familyId);
	let families =
		'coreId' in grouping
			? familiesDirectlyUnderCore(draft, grouping.coreId)
			: subFamiliesOf(draft, grouping.familyId);
	while (features.length + families.length === 1) {
		if (features.length === 1) return { familyIds, featureId: features[0].id };
		const lone = families[0];
		if (familyIds.includes(lone.id)) break;
		familyIds.push(lone.id);
		features = featuresDirectlyUnderFamily(draft, lone.id);
		families = subFamiliesOf(draft, lone.id);
	}
	return { familyIds, featureId: null };
}
