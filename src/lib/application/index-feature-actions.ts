import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { isAuxFeatureId } from './projection/aux-feature-ids';

/**
 * Read-only fold of the canonical kernel into "what can a user actually DO in
 * this feature" — the action list the Features tree shows under each leaf. Pure
 * and framework-free (no engine, no network): it only walks the persisted
 * snapshot the `BehaviorPort` read side already returns.
 *
 * Only a feature's OWN actions are listed. The Core-bridge mirror copies every
 * journey of a Core onto each of its leaves, so those surfaces are borrowed, not
 * owned: listing them would show the same rows under every sibling and claim the
 * leaf does something it never defined. They are recognised by living on the
 * "Experience" aux feature, which is where the journey actually belongs — no
 * marker on disk needed, so features written before this still read correctly.
 *
 * `summarize-behavior` counts the same material; this one names it. Kept apart
 * so the counting summary stays a summary.
 */
export interface FeatureAction {
	id: string;
	name: string;
	/** One-line statement of what the action is for (the kernel's `intent`). */
	intent: string;
	/** Where the action lives — a screen/context name, rendered bare in the UI. */
	surfaceId: string;
	surfaceName: string;
}

/** Actions of every feature, keyed by feature id. */
export type FeatureActionIndex = Record<string, FeatureAction[]>;

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Surface ids the Experience aux feature owns — the ones the mirror lends out. */
function borrowedSurfaceIds(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): Set<string> {
	const ids = new Set<string>();
	for (const { featureId, snapshot } of featureSnapshots) {
		if (!isAuxFeatureId(featureId)) continue;
		const feature = (snapshot?.feature ?? {}) as Record<string, unknown>;
		for (const surfaceRaw of arr(feature.surfaces)) {
			const id = str(((surfaceRaw ?? {}) as Record<string, unknown>).id);
			if (id) ids.add(id);
		}
	}
	return ids;
}

function actionsOf(snap: UnspaFeatureSnapshot | null, borrowed: Set<string>): FeatureAction[] {
	const feature = (snap?.feature ?? {}) as Record<string, unknown>;
	const actions: FeatureAction[] = [];
	for (const surfaceRaw of arr(feature.surfaces)) {
		const surface = (surfaceRaw ?? {}) as Record<string, unknown>;
		const surfaceId = str(surface.id);
		if (borrowed.has(surfaceId)) continue; // mirrored from a journey — not this feature's
		const surfaceName = str(surface.name) || surfaceId;
		for (const actionRaw of arr(surface.actions)) {
			const action = (actionRaw ?? {}) as Record<string, unknown>;
			const id = str(action.id);
			if (!id) continue;
			actions.push({
				id,
				name: str(action.name) || id,
				intent: str(action.intent),
				surfaceId,
				surfaceName
			});
		}
	}
	return actions;
}

export function indexFeatureActions(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): FeatureActionIndex {
	const index: FeatureActionIndex = {};
	const borrowed = borrowedSurfaceIds(featureSnapshots);
	for (const { featureId, snapshot } of featureSnapshots) {
		if (isAuxFeatureId(featureId)) continue; // the tree lists leaves, not aux features
		const actions = actionsOf(snapshot, borrowed);
		if (actions.length > 0) index[featureId] = actions;
	}
	return index;
}
