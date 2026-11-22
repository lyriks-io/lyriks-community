import { disabledMarkerOf, type DisabledMarker, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { featureStatements } from '$lib/unspa-schema/requirement-sentences';
import type { SpecLanguage } from '$domain/language';
import { isAuxFeatureId } from '../projection/aux-feature-ids';

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
	/** Set while the action (or its whole feature) is disabled: who, when and why. */
	disabled?: DisabledMarker;
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
	// A disabled feature disables every action it holds.
	const featureOff = disabledMarkerOf(feature);
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
			const disabled = disabledMarkerOf(action) ?? featureOff;
			actions.push({
				id,
				name: str(action.name) || id,
				intent: str(action.intent),
				surfaceId,
				surfaceName,
				...(disabled ? { disabled } : {})
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

/**
 * The features disabled as a whole, by id, with who disabled them, when and
 * why: what their page shows in its head and what Knowledge leaves out of its
 * counts while they stay disabled.
 */
export function indexDisabledFeatures(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>
): Record<string, DisabledMarker> {
	const disabled: Record<string, DisabledMarker> = {};
	for (const { featureId, snapshot } of featureSnapshots) {
		const marker = disabledMarkerOf(snapshot?.feature);
		if (marker) disabled[featureId] = marker;
	}
	return disabled;
}

/** One scenario of an action, as the feature's page reads it. */
export interface FeatureScenario {
	id: string;
	name: string;
	/** Given / When / Then, as Lyriks writes it from the model (the `statements` of a behaviour read). */
	statement: string;
	/** When the scenario last changed in the spec, when the model stamps it: a proof taken before reads stale. */
	changedAt?: string;
	/** Set while the scenario is disabled, on its own or with the action or feature holding it. */
	disabled?: DisabledMarker;
}

/** Scenarios of every feature, by feature id then action id. Kept apart from the actions, whose reading Knowledge validates. */
export type FeatureScenarioIndex = Record<string, Record<string, FeatureScenario[]>>;

/**
 * Every action's scenarios, each written as Given / When / Then exactly as a
 * behaviour read gives it, with the version it last changed under and its
 * disabled marker. Own surfaces only, like the actions.
 */
export function indexFeatureScenarios(
	featureSnapshots: ReadonlyArray<{ featureId: string; snapshot: UnspaFeatureSnapshot | null }>,
	lang: SpecLanguage = 'en'
): FeatureScenarioIndex {
	const index: FeatureScenarioIndex = {};
	const borrowed = borrowedSurfaceIds(featureSnapshots);
	for (const { featureId, snapshot } of featureSnapshots) {
		if (isAuxFeatureId(featureId)) continue;
		const feature = (snapshot?.feature ?? {}) as Record<string, unknown>;
		const featureOff = disabledMarkerOf(feature);
		const versions = (feature.elementVersions ?? {}) as Record<string, unknown>;
		let statements: Record<string, string> | null = null;
		for (const surfaceRaw of arr(feature.surfaces)) {
			const surface = (surfaceRaw ?? {}) as Record<string, unknown>;
			if (borrowed.has(str(surface.id))) continue;
			for (const actionRaw of arr(surface.actions)) {
				const action = (actionRaw ?? {}) as Record<string, unknown>;
				const actionId = str(action.id);
				const scenarios = arr(action.scenarios);
				if (!actionId || scenarios.length === 0) continue;
				statements ??= featureStatements(feature, lang);
				const held = disabledMarkerOf(action) ?? featureOff;
				(index[featureId] ??= {})[actionId] = scenarios.map((raw) => {
					const scenario = (raw ?? {}) as Record<string, unknown>;
					const id = str(scenario.id);
					const disabled = disabledMarkerOf(scenario) ?? held;
					const changedAt = str(versions[`scenario:${id}`]);
					return {
						id,
						name: str(scenario.name) || id,
						statement: statements?.[`scenario:${id}`] ?? '',
						...(changedAt ? { changedAt } : {}),
						...(disabled ? { disabled } : {})
					};
				});
			}
		}
	}
	return index;
}
