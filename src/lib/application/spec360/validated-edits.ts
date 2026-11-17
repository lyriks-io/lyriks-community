/**
 * What a validated Specification 360° still takes in place while Code drift
 * cannot follow a hand edit (criterion 9b3e04e1, 611e98cb on hold): a decision
 * on a point Lyriks noticed and an operations target, which change nothing the
 * product does, and cancelling a hand edit made earlier. Anything else is
 * changed through an evolution.
 */
const STAYS_OPEN_WHEN_VALIDATED: ReadonlySet<string> = new Set(['keep_finding', 'reopen_finding', 'set_operations_target', 'cancel_hand_edit']);

/** Why this change is refused on this specification, or null when it is taken. */
export function validatedSpecRefusal(validated: boolean, op: string): string | null {
	if (!validated || STAYS_OPEN_WHEN_VALIDATED.has(op)) return null;
	return 'The specification is validated: change it through an evolution.';
}
