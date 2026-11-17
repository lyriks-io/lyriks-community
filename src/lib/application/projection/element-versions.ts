/**
 * Per-element spec stamps (`elementVersions`) for the features Lyriks writes
 * itself (ac-trace-drift-own-change).
 *
 * The engine stamps every element of a feature with the moment it last changed,
 * keyed like the `.unspa.json` index (`"<type>:<id-or-path>"`), so drift names
 * the exact element that moved. Lyriks also writes into those features when it
 * lays a section onto them (the data a leaf uses, the journeys of its core, its
 * acceptance criteria). This module mirrors the engine's digest
 * (unspaghettit `FeatureElementVersions`) so such a write keeps exact stamps:
 * what it adds or changes takes the moment of the write, every other element
 * keeps the date it had, and a feature that never carried stamps is calibrated
 * with its own last date, as the engine does on its first write.
 *
 * Only timestamps are stored, never digests: the engine recomputes both sides
 * from content on its next write, so a key this mirror would name differently
 * costs at most one fallback to the feature's own date, never a changed element
 * reading as clean.
 */

type Row = Record<string, unknown>;

/** Element key to ISO timestamp of the last change to that element. */
export type ElementVersions = Readonly<Record<string, string>>;

/** Deterministic serialization: key order must never decide whether an element changed. */
export const stable = (value: unknown): string => {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
	const entries = Object.entries(value as Row)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
};

/** An element without the collections that carry keys of their own. */
const own = (element: unknown, ...childKeys: string[]): string => {
	const rest: Row = { ...((element ?? {}) as Row) };
	for (const key of childKeys) delete rest[key];
	return stable(rest);
};

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

/**
 * Every keyed element of a feature with a digest of its OWN content, as the
 * engine computes it: children that hold their own key are left out of their
 * parent's digest, so editing a rule moves the rule and nothing else.
 */
export function elementDigests(feature: Row): ReadonlyMap<string, string> {
	const digests = new Map<string, string>();
	const put = (type: string, id: unknown, digest: string) => {
		const suffix = String(id ?? '');
		if (suffix.length > 0) digests.set(`${type}:${suffix}`, digest);
	};

	for (const inv of rows(feature.featureInvariants)) put('invariant', inv.id, stable(inv));
	for (const event of rows(feature.events)) put('event', event.name, stable(event));
	for (const vs of rows(feature.valueSets)) put('valueSet', vs.id, stable(vs));
	for (const persona of rows(feature.personas)) put('persona', persona.id, stable(persona));
	for (const resource of rows(feature.resources)) put('resource', resource.id, stable(resource));
	for (const entity of rows(feature.entities)) put('entity', entity.id, stable(entity));
	for (const criterion of rows(feature.acceptanceCriteria)) put('criterion', criterion.id, stable(criterion));

	for (const surface of rows(feature.surfaces)) {
		put('surface', surface.id, own(surface, 'actions', 'rules', 'invariants', 'transitions', 'stateDefinitions'));
		for (const def of rows(surface.stateDefinitions)) put('state', def.path, stable(def));
		for (const rule of rows(surface.rules)) put('rule', rule.id, stable(rule));
		for (const inv of rows(surface.invariants)) put('invariant', inv.id, stable(inv));
		for (const transition of rows(surface.transitions)) put('transition', transition.id, stable(transition));
		for (const action of rows(surface.actions)) {
			put('action', action.id, own(action, 'rules', 'invariants', 'transitions', 'scenarios', 'exposures'));
			for (const exposure of rows(action.exposures)) put('exposure', exposure.id, stable(exposure));
			for (const rule of rows(action.rules)) put('rule', rule.id, stable(rule));
			for (const inv of rows(action.invariants)) put('invariant', inv.id, stable(inv));
			for (const transition of rows(action.transitions)) put('transition', transition.id, stable(transition));
			for (const scenario of rows(action.scenarios)) put('scenario', scenario.id, stable(scenario));
		}
	}
	return digests;
}

/**
 * The stamps `next` should carry, given what `previous` looked like and when the
 * write happened. Changed and new elements get `now`; untouched ones keep the
 * stamp they had, or the feature's previous `updatedAt` when they have none yet.
 * Removed elements drop out, so the map never outgrows the feature.
 */
export function nextElementVersions(previous: Row | null, next: Row, now: string): ElementVersions {
	const before = previous ? elementDigests(previous) : new Map<string, string>();
	const carried = (previous?.elementVersions ?? {}) as Readonly<Record<string, string>>;
	const fallback = typeof previous?.updatedAt === 'string' ? previous.updatedAt : undefined;
	const versions: Record<string, string> = {};
	for (const [key, digest] of elementDigests(next)) {
		const inherited = before.get(key) === digest ? (carried[key] ?? fallback) : undefined;
		versions[key] = inherited ?? now;
	}
	return versions;
}

/** `next` with its element stamps recomputed against `previous`. */
export const stampElementVersions = (previous: Row | null, next: Row, now: string): Row => ({
	...next,
	elementVersions: nextElementVersions(previous, next, now)
});
