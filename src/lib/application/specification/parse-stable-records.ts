type RecordParser<T> = (record: Record<string, unknown>, id: string) => T | null;

function slug(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
}

/**
 * Parse a keyed collection without creating load-time identity churn.
 *
 * Existing non-empty ids are authoritative; a repeated id is discarded because
 * references cannot distinguish its duplicate. Legacy id-less rows receive a
 * deterministic content/index fallback, so reading the same stored document twice
 * always produces the same ids.
 */
export function parseStableRecords<T>(
	input: unknown,
	prefix: string,
	parse: RecordParser<T>
): T[] {
	if (!Array.isArray(input)) return [];
	const seen = new Set<string>();
	const result: T[] = [];

	input.forEach((candidate, index) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
		const record = candidate as Record<string, unknown>;
		const explicitId =
			typeof record.id === 'string' && record.id.trim().length > 0 ? record.id : null;
		if (explicitId && seen.has(explicitId)) return;

		const seed = slug(record.name) || slug(record.title) || slug(record.label) || `${index + 1}`;
		let id = explicitId ?? `${prefix}-legacy-${seed}`;
		let suffix = 2;
		while (seen.has(id)) id = `${prefix}-legacy-${seed}-${suffix++}`;

		const parsed = parse(record, id);
		if (parsed === null) return;
		seen.add(id);
		result.push(parsed);
	});

	return result;
}
