/**
 * A deep copy of a draft read from storage, so a caller can change its copy
 * without changing what another caller reads.
 *
 * A draft is plain data: objects, arrays, strings, numbers, booleans, null,
 * parsed from JSON and passed through its section's parser. `structuredClone`
 * copies such a value through the serializer, strings included; on lab the
 * Evolution document of the Lyriks project (6 MB) took about 70 ms a copy, and
 * a page copies it twice. Walking the plain data and sharing the strings, which
 * cannot change, gives the same value about six times faster.
 *
 * Anything that is not plain data (a Date, a Map, a class instance, a typed
 * array) is handed to `structuredClone`, so it is copied exactly as before; a
 * value nested deeper than plain data ever is (a cycle) is copied whole by
 * `structuredClone` too.
 */

/** Deeper than any stored document nests; past it the value is not treated as plain data. */
const MAX_DEPTH = 256;

class TooDeep extends Error {}

function copy(value: unknown, depth: number): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (depth > MAX_DEPTH) throw new TooDeep();
	if (Array.isArray(value)) {
		const out = new Array(value.length);
		for (let i = 0; i < value.length; i += 1) out[i] = copy(value[i], depth + 1);
		return out;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return structuredClone(value);
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(value)) out[key] = copy((value as Record<string, unknown>)[key], depth + 1);
	return out;
}

export function cloneData<T>(value: T): T {
	try {
		return copy(value, 0) as T;
	} catch (error) {
		if (error instanceof TooDeep) return structuredClone(value);
		throw error;
	}
}
