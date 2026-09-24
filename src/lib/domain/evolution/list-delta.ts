/**
 * What a proposal would change about a value made of statements.
 *
 * An acceptance list is amended by resending it whole, because the field holds
 * one value. Printing that whole again is what makes a decision unreadable: a
 * reader facing seventeen statements to judge two added ones gives up, and a
 * card nobody reads gets signed without being read, which is worse than no card
 * at all.
 *
 * So the card shows the delta and folds what is untouched. Matching is exact on
 * the trimmed statement: a reworded statement reads as one removed and one
 * added, which is what it is, and no similarity score gets to decide otherwise.
 *
 * Pure and framework-free.
 */

/** One statement per line, blanks dropped: how a list field is written and read. */
export const linesOf = (value: string): string[] =>
	value
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');

export interface ListDelta {
	/** Statements the proposal brings that the value does not hold. */
	readonly added: readonly string[];
	/** Statements the value holds that the proposal drops. */
	readonly removed: readonly string[];
	/** Statements both hold, in the order the proposal keeps them. */
	readonly kept: readonly string[];
	/** True when the proposal changes nothing at all. */
	readonly identical: boolean;
}

export function listDelta(current: string, proposed: string): ListDelta {
	const before = linesOf(current);
	const after = linesOf(proposed);
	const beforeHas = new Set(before);
	const afterHas = new Set(after);
	const added = after.filter((line) => !beforeHas.has(line));
	const removed = before.filter((line) => !afterHas.has(line));
	return {
		added,
		removed,
		kept: after.filter((line) => beforeHas.has(line)),
		identical: added.length === 0 && removed.length === 0
	};
}
