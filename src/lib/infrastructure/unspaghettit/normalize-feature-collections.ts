/**
 * Give a feature snapshot every collection the engine's scorer walks.
 *
 * `computeFeatureMaturity` iterates `surface.rules`, `surface.actions`,
 * `action.effects` and their siblings directly, without defaulting them. A
 * snapshot that lost one of those arrays therefore makes the scorer throw
 * `surface.rules is not iterable`, and a throw scores 0, which the platform
 * reads as "nothing authored here": the feature blocks its project on missing
 * behavior while holding a full model. Supplying the empty arrays turns that
 * back into the real number.
 *
 * Only absent or non-array values are filled, so a well-formed snapshot scores
 * exactly as it did. The input is never mutated: the stored snapshot belongs to
 * whoever loaded it, and scoring must not edit what it was asked to read.
 */

/** Collections the scorer reads on the feature itself. */
const FEATURE_COLLECTIONS = [
	'surfaces',
	'events',
	'personas',
	'entities',
	'resources',
	'scenarios',
	'acceptanceCriteria',
	'featureInvariants',
	'reachabilityGoals'
] as const;

/** Collections the scorer reads on each surface. */
const SURFACE_COLLECTIONS = [
	'stateDefinitions',
	'actions',
	'rules',
	'invariants',
	'transitions',
	'scenarios',
	'reachabilityGoals'
] as const;

/** Collections the scorer reads on each action. */
const ACTION_COLLECTIONS = [
	'parameters',
	'rules',
	'effects',
	'onBlockedEffects',
	'emittedEvents',
	'requiredStates',
	'invariants',
	'scenarios'
] as const;

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A copy of `bag` where every named key holds an array. */
function withArrays(bag: Bag, keys: readonly string[]): Bag {
	const out: Bag = { ...bag };
	for (const key of keys) {
		if (!Array.isArray(out[key])) out[key] = [];
	}
	return out;
}

export function normalizeFeatureCollections(feature: unknown): unknown {
	if (!isBag(feature)) return feature;
	const normalized = withArrays(feature, FEATURE_COLLECTIONS);
	normalized.surfaces = (normalized.surfaces as unknown[]).map((surface) => {
		if (!isBag(surface)) return surface;
		const withSurfaceArrays = withArrays(surface, SURFACE_COLLECTIONS);
		// Only `actions` holds actions: mapping every surface collection through
		// the action shape would hang parameter and effect lists off the rules.
		withSurfaceArrays.actions = (withSurfaceArrays.actions as unknown[]).map((action) =>
			isBag(action) ? withArrays(action, ACTION_COLLECTIONS) : action
		);
		return withSurfaceArrays;
	});
	return normalized;
}
