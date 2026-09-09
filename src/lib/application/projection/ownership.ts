/**
 * Node ownership — the explicit "origin metadata" for projected kernel nodes (MR 7).
 *
 * Lyriks and the engine (unspa dashboard / MCP) co-author one behavior model.
 * Which side owns a given node is not stored as a field on the node (that would
 * fight the unspa wire contract, where the kernel is the source of truth); it is
 * derivable from the node's **id prefix**, because every id Lyriks mints follows a
 * fixed convention while engine-authored nodes get minted hex ids. This module
 * makes that convention the single, documented ownership authority so callers stop
 * hard-coding prefix checks.
 *
 * Ownership decides two things: (1) whose content a merge may drop vs must keep,
 * and (2) which nodes a tombstone is allowed to suppress — a tombstone may only
 * remove a node Lyriks owns, so a stray tombstone can never delete engine depth.
 *
 * Safety invariant this relies on: engine-authored nodes (dashboard / MCP /
 * apply_behavior_batch) carry MACHINE-MINTED ids (content ids / hex), never a
 * Lyriks prefix — the author supplies a `ref`, the engine mints the id. So a
 * Lyriks-prefixed id is always Lyriks's, and dropping an unprojected Lyriks-owned
 * node can never silently delete engine content.
 *
 * See docs/architecture/ownership-matrix.md for the full table.
 */

/** Id prefixes for nodes Lyriks authors from the wizard (mints and re-projects). */
export const LYRIKS_OWNED_PREFIXES = [
	'srf-', // surfaces: journeys (srf-<journeyId>) and screens (srf-screen-<id>)
	'act-', // actions: steps, element actions, input writes (act-write-<id>)
	'per-', // personas (from actor roles)
	'evt-', // events
	'eff-', // effects: emit_event (eff-<id>-<i>) and set_state (eff-ui-<id>-<tid>)
	'ac-edge-', // acceptance criteria authored in the Rules step
	'ent-', // data-model entities
	'fld-', // entity fields
	'res-db-', // data-model resources (db)
	'res-if-', // data-model resources (interface)
	'seq-', // sequential step transitions
	'lnk-', // link transitions
	'nav-', // element navigation transitions
	'st-', // state definitions / seeds (st-, st-seed-)
	'core-', // materialised membership Core
	'family-' // materialised membership Family
] as const;

export type NodeOrigin = 'lyriks' | 'engine';

/** True iff `id` follows a Lyriks minting convention (i.e. Lyriks owns the node). */
export function isLyriksOwned(id: string | undefined): boolean {
	return typeof id === 'string' && LYRIKS_OWNED_PREFIXES.some((p) => id.startsWith(p));
}

/** The origin of a node by its id: `lyriks` for a minted-convention id, else `engine`. */
export function nodeOrigin(id: string | undefined): NodeOrigin {
	return isLyriksOwned(id) ? 'lyriks' : 'engine';
}

/**
 * Whether a tombstone may suppress the node with this id. Only Lyriks-owned nodes
 * are tombstonable — the engine owns its depth, and a tombstone must never be able
 * to delete it (defends against a mis-recorded tombstone nuking engine content).
 */
export function isTombstonable(id: string | undefined): boolean {
	return isLyriksOwned(id);
}
