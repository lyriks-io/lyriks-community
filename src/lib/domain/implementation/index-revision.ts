/**
 * The revision of a project's implementation index (feat-100, criteria
 * fbe61ab1 and 93abb7df).
 *
 * Two checkouts of one repository each hold their own `.unspa.json`, and a
 * sync, a move of lines or a report replaces what was located under every unit
 * it names: without a guard, the last one to send replaces what the other wrote
 * and nobody is told. So every write answers the revision it made, and a caller
 * that names the revision it wrote against is refused only where a write since
 * then touched a unit it sends.
 */

/** How many units a refusal names; the total is always kept. */
export const REVISION_CONFLICT_LIST = 50;

/** A write refused because units it sends were written since the revision it names. */
export interface IndexRevisionConflict {
	readonly expected: number;
	readonly current: number;
	/** Every unit written since `expected` that this write sends. */
	readonly units: readonly string[];
}

/**
 * The expected revision a caller sent: null when none was given, the number
 * otherwise, `invalid` for anything that is not a revision.
 */
export function parseExpectedRevision(value: unknown): number | null | 'invalid' {
	if (value === undefined || value === null) return null;
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 'invalid';
}

/** The units of `sent` written after `expected`, given when each unit was last written. */
export function unitsWrittenSince(
	sent: readonly string[],
	lastWritten: ReadonlyMap<string, number>,
	expected: number
): string[] {
	return [...new Set(sent)].filter((unit) => (lastWritten.get(unit) ?? 0) > expected);
}

/** What the refusal says: the units first (the first 50), the current revision to send again with. */
export function revisionConflictMessage(conflict: IndexRevisionConflict): string {
	const named = conflict.units.slice(0, REVISION_CONFLICT_LIST);
	const more = conflict.units.length - named.length;
	const units = more > 0 ? `${named.join(', ')} and ${more} more` : named.join(', ');
	return (
		`The index of this project changed since revision ${conflict.expected}: ${conflict.units.length} of the units sent ` +
		`were written since by another sync or report (${units}). Nothing was written. Read them back, keep what is ` +
		`still true, and send again with expected_revision ${conflict.current}.`
	);
}

/** The body of the 409: the message, both revisions, and the units cut to their head with the total kept. */
export function revisionConflictBody(conflict: IndexRevisionConflict): {
	readonly message: string;
	readonly expectedRevision: number;
	readonly currentRevision: number;
	readonly units: readonly string[];
	readonly total: number;
} {
	return {
		message: revisionConflictMessage(conflict),
		expectedRevision: conflict.expected,
		currentRevision: conflict.current,
		units: conflict.units.slice(0, REVISION_CONFLICT_LIST),
		total: conflict.units.length
	};
}

/**
 * The units a sync of these keys replaces: every action and surface sent with
 * its own entry (its report is replaced whole), and every criterion it names
 * (its record is replaced). A child key alone replaces nothing.
 */
export function unitsReplacedBy(keys: readonly string[]): string[] {
	return [...new Set(keys.filter((key) => /^(action|surface|criterion):./.test(key)))];
}
