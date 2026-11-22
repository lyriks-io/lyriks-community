import type { IndexUnit } from './index-units';

/**
 * The index keys an open Evolution request adds, as a lookup answers them
 * (feat-100, criterion a501859a).
 *
 * What a request's drafts add is not in the specification until the change
 * lands, so no feature declares it; a sync holds such entries on the request
 * instead of losing them as orphans. A lookup that left them under orphans made
 * `sync-index.mjs --since` drop them, so they are answered with the request and
 * the draft that adds them, in the unit the draft's model places them in.
 */

/** One draft of an open request: the units its model makes and the keys it adds. */
export interface DraftIndexUnits {
	readonly requestId: string;
	readonly draftId: string;
	/** The units of the feature the draft's model makes (an amended action holds its official keys too). */
	readonly units: readonly IndexUnit[];
	/** The keys the draft adds, those a sync holds on the request. */
	readonly adds: readonly string[];
}

/** The keys asked that one draft adds, grouped by the unit its model places them in. */
export interface RequestKeyHolders {
	readonly requestId: string;
	readonly draftId: string;
	/** Every unit of the draft's model holding a key asked that the draft adds, with every key of that unit. */
	readonly units: readonly IndexUnit[];
	/** The keys asked that the draft adds and no unit of its model carries (its criteria). */
	readonly alone: readonly string[];
}

/** For each key asked, the open requests whose drafts add it, and where their models place it. */
export function indexKeyHolders(drafts: readonly DraftIndexUnits[], keys: readonly string[]): RequestKeyHolders[] {
	const asked = new Set(keys);
	const rows: RequestKeyHolders[] = [];
	for (const draft of drafts) {
		const held = draft.adds.filter((key) => asked.has(key));
		if (held.length === 0) continue;
		const heldSet = new Set(held);
		const units = draft.units.filter((unit) => unit.keys.some((key) => heldSet.has(key)));
		const inUnits = new Set(units.flatMap((unit) => unit.keys));
		rows.push({ requestId: draft.requestId, draftId: draft.draftId, units, alone: held.filter((key) => !inUnits.has(key)) });
	}
	return rows;
}

/** The keys asked that some draft adds: those are no orphans. */
export function heldKeys(drafts: readonly DraftIndexUnits[], keys: readonly string[]): Set<string> {
	const added = new Set(drafts.flatMap((draft) => draft.adds));
	return new Set(keys.filter((key) => added.has(key)));
}
