import { experienceFeatureId } from './aux-feature-ids';

/**
 * A wizard-side reference to an entity whose kernel address we want. Exactly one
 * target (journey/step/screen/surface/action) is expected; when none is given the
 * address is just the Experience feature.
 */
export interface BehaviorAddressQuery {
	readonly projectId: string;
	readonly journeyId?: string;
	readonly stepId?: string;
	readonly screenId?: string;
	readonly surfaceId?: string;
	readonly actionId?: string;
}

/** The purely-computed kernel address (no engine needed). */
export interface BehaviorAddress {
	readonly featureId: string;
	/** The get_neighborhood root key, or null when only the feature was asked for. */
	readonly rootKey: string | null;
	readonly surfaceId: string | null;
	readonly actionId: string | null;
}

/**
 * The id bridge (Fix #2): translate a wizard journey/step/screen id into its
 * kernel address with the SAME scheme the Experience projection emits —
 * `srf-<journeyId>`, `act-<stepId>`, `srf-screen-<screenId>` — so an author never
 * hand-translates. Pure and framework-free. A step's surface is left null here
 * (it depends on the owning journey, which the engine resolves authoritatively via
 * the neighborhood root).
 */
export function resolveBehaviorAddress(q: BehaviorAddressQuery): BehaviorAddress {
	const featureId = experienceFeatureId(q.projectId);
	if (q.stepId) return { featureId, rootKey: `action:act-${q.stepId}`, surfaceId: null, actionId: `act-${q.stepId}` };
	if (q.actionId) return { featureId, rootKey: `action:${q.actionId}`, surfaceId: null, actionId: q.actionId };
	if (q.journeyId) {
		const s = `srf-${q.journeyId}`;
		return { featureId, rootKey: `surface:${s}`, surfaceId: s, actionId: null };
	}
	if (q.screenId) {
		const s = `srf-screen-${q.screenId}`;
		return { featureId, rootKey: `surface:${s}`, surfaceId: s, actionId: null };
	}
	if (q.surfaceId) return { featureId, rootKey: `surface:${q.surfaceId}`, surfaceId: q.surfaceId, actionId: null };
	return { featureId, rootKey: null, surfaceId: null, actionId: null };
}
