import type { Incoherence } from './incoherence';

/**
 * What the headline tiles of the Control Center's Coherence tab do: each one is
 * a lens on the same list, not a number to admire. Pressing one keeps only the
 * incoherences it counts; pressing it again (or "Show all") brings everything
 * back. There is deliberately no "points" figure anywhere: what a single fix is
 * worth to the score depends on every other open gap, so a number printed on a
 * card would always be wrong.
 */
export type CoherenceFocus = 'all' | 'blocking' | 'high' | 'new';

/** Whether an incoherence is in the set a focus keeps. */
export function inFocus(
	inc: Pick<Incoherence, 'id' | 'blocking' | 'severity'>,
	focus: CoherenceFocus,
	newIds: ReadonlySet<string>
): boolean {
	if (focus === 'blocking') return inc.blocking;
	if (focus === 'high') return inc.severity === 'high';
	if (focus === 'new') return newIds.has(inc.id);
	return true;
}
