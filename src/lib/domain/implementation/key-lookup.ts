/**
 * The bounds of a key lookup (feat-100, action af8d9001, constant maxKeysPerLookup).
 *
 * One answer must fit what an AI client accepts: a cut answer would leave keys
 * without owner and units sent without their children. Measured on the
 * project that specifies Lyriks against the gateway's 24,000-character cap:
 * 150 keys of distinct units answer in 21,804 characters, 160 in 23,623, 500
 * in 75,701 to 102,972. A state many features declare comes back with every
 * surface declaring it (one key alone reached 54,747), so the gateway also
 * answers whole keys while they fit and names the rest for another call. The
 * sync command splits its keys into calls of this size (index-since.mjs holds
 * the same number).
 */
export const MAX_KEYS_PER_LOOKUP = 150;

/** Why a lookup cannot be answered, or null when its keys can be read. */
export function keyLookupRefusal(keys: unknown): string | null {
	if (keys === undefined || keys === null || (Array.isArray(keys) && keys.length === 0)) {
		return 'keys must list at least one index key';
	}
	if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || key === '')) {
		return 'keys must be a list of index keys, each "<type>:<id-or-path>"';
	}
	if (keys.length > MAX_KEYS_PER_LOOKUP) {
		return `At most ${MAX_KEYS_PER_LOOKUP} keys per call: send the rest in another call.`;
	}
	return null;
}
