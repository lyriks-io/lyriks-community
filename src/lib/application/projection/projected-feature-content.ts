/**
 * Compare projected content, not write timestamps or engine-derived version maps.
 * Only top-level bookkeeping is omitted: nested product fields with the same
 * names are still part of the content. Object key order is not a product edit.
 */
export function sameProjectedFeature(
	left: Record<string, unknown>,
	right: Record<string, unknown>
): boolean {
	const content = (feature: Record<string, unknown>) => {
		const { updatedAt: _time, elementVersions: _versions, ...rest } = feature;
		return canonical(rest);
	};
	return content(left) === content(right);
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
	if (value && typeof value === 'object') {
		return '{' + Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
			.join(',') + '}';
	}
	return JSON.stringify(value) ?? 'null';
}
