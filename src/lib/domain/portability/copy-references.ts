/** Reference slots change identity; prose, captured code and scenario values do not. */
const LITERAL_FIELDS = new Set(['name', 'title', 'label', 'description', 'intent', 'reason', 'message', 'text', 'content', 'snippet', 'statement', 'summary', 'rationale', 'note', 'notes', 'given', 'when', 'then', 'value', 'defaultValue', 'capturedFields', 'code', 'path', 'words', 'takes']);
const REFERENCE_PREFIXES = new Set(['feature', 'action', 'surface', 'rule', 'scenario', 'beh', 'source', 'engine']);
const SOURCE_FIELDS = new Set(['sourceId', 'storedSourceId', 'sourceIds']);
const REFERENCE_FIELDS = new Set(['id', 'ref', 'anchor', 'dependsOn', 'from', 'to', 'target']);

export interface CopyIdentities {
	readonly records: ReadonlyMap<string, string>;
	readonly sources: ReadonlyMap<string, string>;
}

/** A capability key or an assignment key contains ids without being prose. */
function reference(value: string, ids: ReadonlyMap<string, string>): string {
	const exact = ids.get(value);
	if (exact) return exact;
	const assignment = value.split('::');
	if (assignment.length === 2 && ids.has(assignment[0])) return `${ids.get(assignment[0])}::${assignment[1]}`;
	const parts = value.split(':');
	return REFERENCE_PREFIXES.has(parts[0]) && !/\s/.test(value)
		? parts.map(part => ids.get(part) ?? part).join(':')
		: value;
}

export function copyReferences<T>(value: T, ids: CopyIdentities): T {
	function visit(current: unknown, field = ''): unknown {
		if (LITERAL_FIELDS.has(field)) return structuredClone(current);
		if (typeof current === 'string') {
			if (SOURCE_FIELDS.has(field)) return ids.sources.get(current) ?? reference(current, ids.records);
			if (REFERENCE_FIELDS.has(field) || /(?:Id|Ids|Ref|_id|_ids)$/.test(field)) return reference(current, ids.records);
			return current;
		}
		if (Array.isArray(current)) return current.map(item => {
			const next = visit(item, field);
			// A source catalog may use the stored source id as its own row id.
			if (field === 'sources' && next && typeof next === 'object' && !Array.isArray(next)) {
				const row = next as Record<string, unknown>;
				const originalId = (item as Record<string, unknown>).id;
				if (typeof originalId === 'string' && ids.sources.has(originalId)) return { ...row, id: ids.sources.get(originalId) };
			}
			return next;
		});
		if (current && typeof current === 'object') {
			const result = Object.fromEntries(Object.entries(current).map(([key, item]) => [reference(key, ids.records), visit(item, key)]));
			const originalId = (current as Record<string, unknown>).id;
			if (field === 'stored' && typeof originalId === 'string') result.id = ids.sources.get(originalId) ?? result.id;
			return result;
		}
		return current;
	}
	return visit(value) as T;
}
