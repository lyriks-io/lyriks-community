/**
 * Where people put the tables of the data map by hand (criterion 7f5769bb).
 *
 * Kept for the project apart from the specification: a move says nothing about
 * the data, so it marks nothing to validate and moves no version. Each position
 * is a table's top-left corner inside its database, in map pixels; a table with
 * none stands where the layout places it.
 */
export interface TablePlacement {
	readonly x: number;
	readonly y: number;
}

export interface MapPlacements {
	readonly tables: Readonly<Record<string, TablePlacement>>;
}

export const NO_PLACEMENTS: MapPlacements = { tables: {} };

export type PlacementAct =
	| { readonly kind: 'move'; readonly tableId: string; readonly x: number; readonly y: number }
	| { readonly kind: 'arrange' };

export type PlacementOutcome = { readonly ok: true; readonly document: MapPlacements } | { readonly ok: false; readonly refusal: string };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Whole pixels, never above or left of the database's own corner. */
const pixel = (v: number) => Math.max(0, Math.round(v));

/** The stored document, read at the data context's edge: what is not a position is dropped. */
export function parseMapPlacements(raw: unknown): MapPlacements {
	const tables = raw && typeof raw === 'object' ? (raw as { tables?: unknown }).tables : null;
	if (!tables || typeof tables !== 'object') return NO_PLACEMENTS;
	const kept: Record<string, TablePlacement> = {};
	for (const [id, p] of Object.entries(tables as Record<string, unknown>)) {
		const at = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
		if (id.trim() !== '' && at && finite(at.x) && finite(at.y)) kept[id] = { x: pixel(at.x), y: pixel(at.y) };
	}
	return { tables: kept };
}

/** How many tables stand where a person put them. */
export const placedByHand = (doc: MapPlacements): number => Object.keys(doc.tables).length;

/** A table moved where it was let go, or every table put back where the layout places it (actions f1ba7185, c11e8905). */
export function applyPlacementAct(doc: MapPlacements, act: PlacementAct): PlacementOutcome {
	if (act.kind === 'arrange') {
		if (placedByHand(doc) === 0) return { ok: false, refusal: 'Every table already stands where the layout places it.' };
		return { ok: true, document: NO_PLACEMENTS };
	}
	if (act.tableId.trim() === '' || !finite(act.x) || !finite(act.y)) return { ok: false, refusal: 'Name the table and where it goes.' };
	return { ok: true, document: { tables: { ...doc.tables, [act.tableId]: { x: pixel(act.x), y: pixel(act.y) } } } };
}
