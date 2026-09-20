/**
 * Is this string a full ISO 8601 instant: date, time and zone?
 *
 * That is the only form a stored version stamp (`updatedAt`) ever takes. A date
 * alone, or a local time without a zone, can never equal one, so a caller that
 * compares versions refuses it up front ("this is not a version stamp") instead
 * of running a comparison that can never succeed.
 */
export function isIsoInstant(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
	// The pattern admits month 13 or hour 25; the parser does not.
	return !Number.isNaN(Date.parse(value));
}
