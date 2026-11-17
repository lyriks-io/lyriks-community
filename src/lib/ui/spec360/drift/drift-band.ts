/**
 * What the band above the Specification 360° pages says of the code drift
 * (criterion 7b21b4a6), from the decision each change reads with and the
 * changes made in the specification by hand (criterion 68b978c4): what is
 * still to review first; once none is left, the rejected code changes and the
 * kept edits still waiting for the code to follow the spec; nothing once
 * neither is left. Pure.
 */
export interface DriftBand {
	readonly title: string;
	readonly lead: string;
	/** The link's words, before its arrow. */
	readonly go: string;
}

/** The hand edits of the validated specification: to review (not read against the code yet, or contradicted by it), and kept. */
export interface HandEditCounts {
	readonly toReview: number;
	readonly kept: number;
}

const NONE: HandEditCounts = { toReview: 0, kept: 0 };
const handEditsToReview = (n: number) => (n === 1 ? '1 change made in the spec by hand is to review' : `${n} changes made in the spec by hand are to review`);
const keptEdits = (n: number) => (n === 1 ? '1 kept change of the spec waits for the code to follow it' : `${n} kept changes of the spec wait for the code to follow them`);

export function driftBandOf(decisions: readonly ('kept' | 'sent_back' | null)[], hand: HandEditCounts = NONE): DriftBand | null {
	const pending = decisions.filter((d) => d === null).length;
	if (pending > 0) {
		return {
			title: pending === 1 ? '1 code change is not in the spec' : `${pending} code changes are not in the spec`,
			lead: `Made outside Knowledge and Changes. Review them.${hand.toReview > 0 ? ` ${handEditsToReview(hand.toReview)}.` : ''}`,
			go: 'Review'
		};
	}
	if (hand.toReview > 0) {
		return { title: handEditsToReview(hand.toReview), lead: 'The next Reverse-Specification reads the code against each one; it is decided then.', go: 'Review' };
	}
	const rejected = decisions.filter((d) => d === 'sent_back').length;
	if (rejected > 0) {
		return {
			title: rejected === 1 ? '1 rejected code change waits for the code to follow the spec' : `${rejected} rejected code changes wait for the code to follow the spec`,
			lead: `A restore was requested: each one leaves once the code reads as the spec again.${hand.kept > 0 ? ` ${keptEdits(hand.kept)}.` : ''}`,
			go: 'Follow them'
		};
	}
	if (hand.kept > 0) return { title: keptEdits(hand.kept), lead: 'Each one leaves once a Reverse-Specification reads the code as the spec.', go: 'Follow them' };
	return null;
}
