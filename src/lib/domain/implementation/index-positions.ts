import type { KeyPlace } from './index-units';

/**
 * Moving located lines without touching coverage (feat-100, action f20cf75e,
 * criterion e9699cc6).
 *
 * A line that only moved used to cost its whole action or surface sent again,
 * and a sync of a unit sent without all of its children drops their coverage.
 * Here the places Lyriks already holds are read back from the reports, only
 * the file, line and code line of the keys sent are replaced, and each touched
 * report is landed again with exactly what it located before: no key is added,
 * none is lost, and the audit stamps (verifiedAt among them) travel with it.
 */

type Row = Readonly<Record<string, unknown>>;

const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** One index entry, the shape `.unspa.json` holds and a sync takes. */
export type IndexEntry = Readonly<Record<string, unknown>>;

/** What the last reports of one feature located, keyed the way the index is. */
export interface LocatedFeature {
	/** Per action or surface report: its audit stamps and the entry of every key it located. */
	readonly units: ReadonlyMap<string, { readonly meta: Row; readonly entries: ReadonlyMap<string, IndexEntry> }>;
	/** The criteria a sync recorded, by key, with what verifies them. */
	readonly criteria: ReadonlyMap<string, Row>;
}

/** The index key of one entity a report found; null for what the index does not key (`data`). */
function keyOfFound(found: Row, statePaths: ReadonlyMap<string, string>): string | null {
	const type = text(found.entityType);
	const id = typeof found.entityId === 'number' ? String(found.entityId) : text(found.entityId);
	if (!type || !id) return null;
	// A state is reported under the id of its definition and keyed by its path.
	if (type === 'state') return `state:${statePaths.get(id) ?? id}`;
	return ['action', 'event', 'rule', 'invariant', 'transition', 'surface_rule', 'surface_invariant'].includes(type) ? `${type}:${id}` : null;
}

/** The entry a stored location reads as: its code line is evidence only when one reached the server. */
function entryOfLocation(location: Row): IndexEntry {
	const line = typeof location.line === 'number' ? { line: location.line } : {};
	const signature = location.unverified !== true && text(location.snippet) ? { signature: location.snippet } : {};
	return { status: 'implemented', file: location.file, ...line, ...signature };
}

/**
 * What the reports of one feature located, read from the engine's status of the
 * feature (`actions`, `surfaces`, `criteria`) laid against the feature itself.
 */
export function locatedFeature(feature: Row, status: Row | null): LocatedFeature {
	const statePaths = new Map<string, string>();
	for (const surface of rows(feature.surfaces)) {
		for (const state of rows(surface.stateDefinitions)) {
			const id = text(state.id);
			const path = text(state.path);
			if (id && path) statePaths.set(id, path);
		}
	}
	const units = new Map<string, { meta: Row; entries: Map<string, IndexEntry> }>();
	const read = (unit: string, report: Row) => {
		const entries = new Map<string, IndexEntry>();
		for (const found of rows(report.foundEntities)) {
			const key = keyOfFound(found, statePaths);
			const location = rows(found.locations)[0];
			if (key && location && text(location.file)) entries.set(key, entryOfLocation(location));
		}
		units.set(unit, { meta: isRow(report.auditMeta) ? report.auditMeta : {}, entries });
	};
	for (const report of rows(status?.actions)) if (text(report.actionId)) read(`action:${report.actionId}`, report);
	for (const report of rows(status?.surfaces)) if (text(report.surfaceId)) read(`surface:${report.surfaceId}`, report);
	const criteria = new Map<string, Row>();
	for (const row of rows(status?.criteria)) {
		const key = text(row.key) ?? (text(row.criterionId) ? `criterion:${row.criterionId}` : null);
		if (key && row.indexed === true) criteria.set(key, row);
	}
	return { units, criteria };
}

/** The positions to land and what could not be moved. */
export interface PositionsPlan {
	/** Partial indexes to sync one after the other; each lands its units with exactly what they located. */
	readonly batches: readonly Readonly<Record<string, IndexEntry>>[];
	/** The action and surface reports landed again, and the criteria recorded again. */
	readonly units: readonly string[];
	/** The keys whose place was updated. */
	readonly moved: readonly string[];
	/** Keys some feature declares but no report or record of Lyriks holds a place for: a move adds no coverage. */
	readonly notLocated: readonly string[];
	/** Keys no feature declares. */
	readonly orphans: readonly string[];
}

/** The place of an entry: file, line and code line, nothing else. */
function placeOf(entry: unknown): IndexEntry {
	if (!isRow(entry)) return {};
	return {
		...(entry.file !== undefined ? { file: entry.file } : {}),
		...(entry.line !== undefined ? { line: entry.line } : {}),
		...(entry.signature !== undefined ? { signature: entry.signature } : {})
	};
}

/** A stored entry at its new place: the old place goes whole, so a code line left out reads as a claim again. */
function moved(stored: IndexEntry, sent: unknown): IndexEntry {
	const { file: _file, line: _line, signature: _signature, ...rest } = stored;
	return { ...rest, ...placeOf(sent) };
}

interface UnitLanding {
	readonly unit: string;
	readonly childKeys: ReadonlySet<string>;
	readonly entries: ReadonlyMap<string, IndexEntry>;
}

const sameEntry = (a: IndexEntry, b: IndexEntry) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether a unit can land in a batch: the index is flat, so a key one unit
 * located must not reach another unit of the batch that did not locate it (it
 * would gain coverage), nor carry two places.
 */
function fits(batch: { index: Map<string, IndexEntry>; units: UnitLanding[] }, landing: UnitLanding): boolean {
	for (const [key, entry] of landing.entries) {
		const held = batch.index.get(key);
		if (held && !sameEntry(held, entry)) return false;
		if (batch.units.some((other) => other.childKeys.has(key) && !other.entries.has(key))) return false;
	}
	for (const key of batch.index.keys()) if (landing.childKeys.has(key) && !landing.entries.has(key)) return false;
	return true;
}

/**
 * Plan a move of lines: which reports to land again, with which entries, and
 * which keys sent cannot move because Lyriks holds no place for them.
 *
 * `places` says where each key travels (keyPlaces); `unitKeys` every key of
 * each unit (to keep a unit from gaining a key it did not locate); `located`
 * what each feature's reports hold.
 */
export function planPositions(
	sent: Readonly<Record<string, unknown>>,
	places: ReadonlyMap<string, readonly KeyPlace[]>,
	unitKeys: ReadonlyMap<string, readonly string[]>,
	located: ReadonlyMap<string, LocatedFeature>
): PositionsPlan {
	const orphans: string[] = [];
	const notLocated: string[] = [];
	const movedKeys: string[] = [];
	const touched = new Map<string, { featureId: string; unit: string }>();
	const criteria = new Map<string, IndexEntry>();

	for (const [key, entry] of Object.entries(sent)) {
		const where = places.get(key) ?? [];
		if (where.length === 0) {
			orphans.push(key);
			continue;
		}
		let found = false;
		for (const place of where) {
			const feature = located.get(place.featureId);
			if (!feature) continue;
			if (place.unit === null) {
				const record = key.startsWith('criterion:') ? feature.criteria.get(key) : undefined;
				if (!record) continue;
				found = true;
				const status = isRow(entry) && entry.status === 'partial' ? 'partial' : 'implemented';
				criteria.set(key, {
					status,
					...placeOf(entry),
					...(record.verification !== undefined ? { verification: record.verification } : {}),
					...(record.specVersion !== undefined ? { specVersion: record.specVersion } : {})
				});
				continue;
			}
			const report = feature.units.get(place.unit);
			// A surface report holds no place of its own: the surface is located when its report exists.
			const holds = report && (report.entries.has(key) || (key === place.unit && key.startsWith('surface:')));
			if (!holds) continue;
			found = true;
			touched.set(`${place.featureId}\u0000${place.unit}`, place as { featureId: string; unit: string });
		}
		if (found) movedKeys.push(key);
		else notLocated.push(key);
	}

	const landings: UnitLanding[] = [];
	for (const { featureId, unit } of touched.values()) {
		const report = located.get(featureId)!.units.get(unit)!;
		const entries = new Map<string, IndexEntry>();
		for (const [key, stored] of report.entries) entries.set(key, key in sent ? moved(stored, sent[key]) : stored);
		// The unit's own entry carries its audit stamps: a sync rebuilds them from it.
		const own = entries.get(unit) ?? { status: 'implemented', ...(unit in sent ? placeOf(sent[unit]) : {}) };
		entries.set(unit, { ...report.meta, ...own });
		landings.push({ unit, childKeys: new Set((unitKeys.get(unit) ?? []).filter((key) => key !== unit)), entries });
	}

	const batches: { index: Map<string, IndexEntry>; units: UnitLanding[] }[] = [];
	for (const landing of landings) {
		let batch = batches.find((candidate) => fits(candidate, landing));
		if (!batch) {
			batch = { index: new Map(), units: [] };
			batches.push(batch);
		}
		batch.units.push(landing);
		for (const [key, entry] of landing.entries) batch.index.set(key, entry);
	}
	if (criteria.size > 0) {
		if (batches.length === 0) batches.push({ index: new Map(), units: [] });
		for (const [key, entry] of criteria) batches[0].index.set(key, entry);
	}

	return {
		batches: batches.map((batch) => Object.fromEntries(batch.index)),
		units: [...new Set([...landings.map((landing) => landing.unit), ...criteria.keys()])],
		moved: movedKeys,
		notLocated,
		orphans
	};
}
