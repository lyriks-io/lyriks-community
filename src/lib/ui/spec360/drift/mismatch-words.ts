/**
 * What Mismatch says of what is happening, in words (owner feedback 2026-11-24,
 * criteria 20b41c3a and d10bd6a6 of feat-36, 87af30d2 of feat-119): a person
 * reads whether there is a mismatch, and what is expected of them, without
 * reading the cards first.
 */

const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

/** The code was compared and nothing differs. */
export const noMismatch = (product: string) => ({
	title: 'No mismatch: everything is in order',
	text: `The code of ${product} does what its specification says: nothing was changed in the code outside the spec and the evolutions.`,
	next: 'Lyriks compares them again each time the code is synced.'
});

/** The code matches; only edits made by hand in the specification are listed. */
export const noMismatchInTheCode = (product: string) => ({
	title: 'No mismatch in the code',
	text: `The code of ${product} does what its specification says. Below, what was changed by hand in the specification: the next Reverse-Specification reads the code against each one.`
});

/** What the counts of the code changes expect of the reader. */
export function codeChangesSaid(counts: { readonly pending: number; readonly accepted: number; readonly rejected: number }): string {
	if (counts.pending > 0)
		return `${many(counts.pending, 'change')} made in the code outside the spec and the evolutions ${counts.pending === 1 ? 'waits' : 'wait'} for a decision: accept each one as it is, or reject it and restore the previous behaviour.`;
	return `Every change is decided: ${counts.accepted} accepted as it is, ${counts.rejected} waiting for the code to follow the spec.`;
}

/** A later run that found nothing. */
export const RUN_FOUND_NOTHING = 'No mismatch: this run found nothing that differs from the specification. Close this report: there is nothing to write.';
