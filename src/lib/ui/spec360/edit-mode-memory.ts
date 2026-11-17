/**
 * How long the Edit mode waits for who left Knowledge (criterion 76d3a766).
 * Pure, so the rule is tested without a browser.
 */
export const EDIT_MODE_WAITS_MS = 5 * 60_000;

/** A tab remembers that the mode was on and, while the reader is away, since when. */
export interface KeptEditMode {
	readonly leftAt: number | null;
}

/** Whether the mode is on again on coming back: still in the tab, and away no longer than the wait. */
export function editModeStillOn(kept: KeptEditMode | null, now: number): boolean {
	return !!kept && (kept.leftAt === null || now - kept.leftAt <= EDIT_MODE_WAITS_MS);
}
