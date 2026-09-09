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

export interface FocusMeta {
	label: string;
	/** What being in this set means, in the reader's words, after "these ...". */
	means: string;
}

export const FOCUS_META: Record<Exclude<CoherenceFocus, 'all'>, FocusMeta> = {
	blocking: {
		label: 'Blocking',
		means: 'hold the build gate and cannot be settled by decision'
	},
	high: { label: 'High severity', means: 'weigh most on the coherence score' },
	new: { label: 'New', means: 'were not open on your last visit' }
};

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

/**
 * The incoherences a focus keeps, in the order they came: the list is already
 * in "do this first" order, so the first kept item is the first to fix in that set.
 */
export function focusList<T extends Pick<Incoherence, 'id' | 'blocking' | 'severity'>>(
	list: readonly T[],
	focus: CoherenceFocus,
	newIds: ReadonlySet<string>
): T[] {
	return list.filter((i) => inFocus(i, focus, newIds));
}
