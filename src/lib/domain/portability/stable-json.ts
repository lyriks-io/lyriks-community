/**
 * Deterministic JSON for bundle entries: keys sorted, fixed indentation.
 *
 * Two exports of an unchanged project must produce byte-identical entries, so
 * bundles diff cleanly and backup storage deduplicates them. Object key order in
 * JavaScript follows insertion, which varies with the path a document took
 * through the stores — sorting removes that as a source of spurious difference.
 */

/** Recursively key-sorted copy. Arrays keep their order: it is data, not layout. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
	}
	return value;
}

/** Pretty, key-sorted JSON with a trailing newline (plays well with text tools). */
export function stableJson(value: unknown): string {
	return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** The same, as UTF-8 bytes — what a bundle entry actually stores. */
export function stableJsonBytes(value: unknown): Uint8Array {
	return new TextEncoder().encode(stableJson(value));
}

/** Parse a bundle entry back. Returns `undefined` for anything unparseable. */
export function parseJsonBytes(bytes: Uint8Array): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
	} catch {
		return undefined;
	}
}
