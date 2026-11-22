/**
 * Which feature declares an implementation-index key, and the unit the key
 * travels with (feat-100, action af8d9001).
 *
 * The index of a repository is a flat map: a key carries an id or a path, never
 * the feature it belongs to. A sync REPLACES what was located under each action
 * or surface it names, so an action or a surface must travel with every key its
 * report carries; anything else is the caller's guess. The grammar and the
 * grouping are the engine's own (buildKeyOwners and the per-action, per-surface
 * reports of sync_from_index in unspaghettit): a key spelled or grouped any other
 * way would land as an orphan, or replace a report without one of its children.
 */

type Row = Readonly<Record<string, unknown>>;

const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const idOf = (row: Row, field = 'id'): string | null => {
	const value = row[field];
	return (typeof value === 'string' && value !== '') || typeof value === 'number' ? String(value) : null;
};

/** One action or surface and every key its report carries, its own key first. */
export interface IndexUnit {
	/** `action:<id>` or `surface:<id>`. */
	readonly unit: string;
	readonly keys: readonly string[];
}

/** The index keys of one feature, as the reports of a sync group them. */
export interface FeatureIndexUnits {
	readonly featureId: string;
	readonly units: readonly IndexUnit[];
	/**
	 * Keys no report carries (acceptance criteria, entities, exposures,
	 * feature-level invariants and events, surface transitions): each one is
	 * sent on its own and replaces no report.
	 */
	readonly alone: readonly string[];
}

/** The keys of a feature grouped into the units its sync reports carry. */
export function featureIndexUnits(feature: Row): FeatureIndexUnits {
	const units: IndexUnit[] = [];
	const inUnit = new Set<string>();
	const declared: string[] = [];
	const add = (into: string[], type: string, id: string | null) => {
		if (id !== null) into.push(`${type}:${id}`);
	};
	for (const inv of rows(feature.featureInvariants)) add(declared, 'invariant', idOf(inv));
	for (const event of rows(feature.events)) add(declared, 'event', idOf(event, 'name'));
	for (const entity of rows(feature.entities)) add(declared, 'entity', idOf(entity));
	for (const criterion of rows(feature.acceptanceCriteria)) add(declared, 'criterion', idOf(criterion));
	for (const surface of rows(feature.surfaces)) {
		const surfaceId = idOf(surface);
		for (const t of rows(surface.transitions)) add(declared, 'transition', idOf(t));
		for (const action of rows(surface.actions)) {
			const actionId = idOf(action);
			for (const exposure of rows(action.exposures)) add(declared, 'exposure', idOf(exposure));
			if (actionId === null) continue;
			const keys = [`action:${actionId}`];
			// Emitted events are bare names in the engine, a row in older snapshots.
			for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : []) {
				add(keys, 'event', isRow(event) ? idOf(event, 'name') : typeof event === 'string' && event !== '' ? event : null);
			}
			for (const rule of rows(action.rules)) add(keys, 'rule', idOf(rule));
			for (const inv of rows(action.invariants)) add(keys, 'invariant', idOf(inv));
			for (const t of rows(action.transitions)) add(keys, 'transition', idOf(t));
			units.push({ unit: keys[0], keys: [...new Set(keys)] });
			keys.forEach((key) => inUnit.add(key));
		}
		if (surfaceId === null) continue;
		const keys = [`surface:${surfaceId}`];
		for (const state of rows(surface.stateDefinitions)) add(keys, 'state', idOf(state, 'path'));
		for (const rule of rows(surface.rules)) add(keys, 'surface_rule', idOf(rule));
		for (const inv of rows(surface.invariants)) add(keys, 'surface_invariant', idOf(inv));
		units.push({ unit: keys[0], keys: [...new Set(keys)] });
		keys.forEach((key) => inUnit.add(key));
	}
	// A declared event that an action emits travels with that action.
	const alone = [...new Set(declared)].filter((key) => !inUnit.has(key));
	return { featureId: idOf(feature) ?? '', units, alone };
}

/** The keys asked that one feature declares, grouped by the unit each travels with. */
export interface FeatureKeyOwners {
	readonly featureId: string;
	/** Every unit holding at least one key asked, with EVERY key of that unit. */
	readonly units: readonly IndexUnit[];
	/** The keys asked that this feature declares and that travel on their own. */
	readonly alone: readonly string[];
}

export interface IndexKeyOwners {
	/** One row per feature declaring at least one key asked: a key several features declare is under each. */
	readonly features: readonly FeatureKeyOwners[];
	/** The keys asked that no feature declares (a typo, a renamed or removed element). */
	readonly orphans: readonly string[];
}

/** For each key asked, the features that declare it and the unit it travels with in each. */
export function indexKeyOwners(features: readonly FeatureIndexUnits[], keys: readonly string[]): IndexKeyOwners {
	const asked = new Set(keys);
	const owned = new Set<string>();
	const rowsOut: FeatureKeyOwners[] = [];
	for (const feature of features) {
		const units = feature.units.filter((unit) => unit.keys.some((key) => asked.has(key)));
		const alone = feature.alone.filter((key) => asked.has(key));
		if (units.length === 0 && alone.length === 0) continue;
		for (const unit of units) for (const key of unit.keys) if (asked.has(key)) owned.add(key);
		alone.forEach((key) => owned.add(key));
		rowsOut.push({ featureId: feature.featureId, units, alone });
	}
	return { features: rowsOut, orphans: [...asked].filter((key) => !owned.has(key)) };
}

/** Where each key travels: the units holding it, by feature, and whether some feature keeps it alone. */
export interface KeyPlace {
	readonly featureId: string;
	/** Null when the key travels on its own in this feature. */
	readonly unit: string | null;
}

/** Every place each key of these features travels with, a key several features declare once per feature. */
export function keyPlaces(features: readonly FeatureIndexUnits[]): ReadonlyMap<string, readonly KeyPlace[]> {
	const places = new Map<string, KeyPlace[]>();
	const put = (key: string, place: KeyPlace) => {
		const list = places.get(key);
		if (list) list.push(place);
		else places.set(key, [place]);
	};
	for (const feature of features) {
		for (const unit of feature.units) for (const key of unit.keys) put(key, { featureId: feature.featureId, unit: unit.unit });
		for (const key of feature.alone) put(key, { featureId: feature.featureId, unit: null });
	}
	return places;
}
