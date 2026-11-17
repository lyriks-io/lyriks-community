import {
	createEmptyDocumentsDraft,
	isDocumentKind,
	type DocumentSource,
	type ProjectDocumentsDraft,
	type SourcePassage
} from '$domain/documents';

/** Anti-corruption parse for the Documents & Sources draft (residue-backed). */
export function parseDocumentsDraft(input: unknown, projectId: string): ProjectDocumentsDraft {
	const base = createEmptyDocumentsDraft(projectId);
	if (!input || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;
	const sources: DocumentSource[] = [];
	const seen = new Set<string>();
	if (Array.isArray(src.sources)) {
		for (const source of src.sources) {
			if (!source || typeof source !== 'object') continue;
			const value = source as Record<string, unknown>;
			if (typeof value.id !== 'string' || value.id.length === 0 || seen.has(value.id)) continue;
			seen.add(value.id);
			sources.push({
				id: value.id,
				title: typeof value.title === 'string' ? value.title : '',
				kind: isDocumentKind(value.kind) ? value.kind : 'link',
				url: typeof value.url === 'string' ? value.url : '',
				note: typeof value.note === 'string' ? value.note : '',
				...parseStored(value.stored),
				...parseSourceMetadata(value)
			});
		}
	}
	const passages = parsePassages(src.passages, seen);
	return {
		...base,
		projectId,
		sources,
		...(passages.length > 0 ? { passages } : {})
	};
}

/** The reference to the text Unspag stores for a source: its id and its hash, never its bytes. */
function parseStored(value: unknown): Pick<DocumentSource, 'stored'> {
	const v = value as Record<string, unknown> | null;
	return v && typeof v === 'object' && typeof v.id === 'string' && v.id && typeof v.hash === 'string' ? { stored: { id: v.id, hash: v.hash } } : {};
}

/** The passages that quote a source the register still holds, each a well-formed place. */
function parsePassages(value: unknown, sourceIds: ReadonlySet<string>): SourcePassage[] {
	if (!Array.isArray(value)) return [];
	const out: SourcePassage[] = [];
	for (const raw of value) {
		const p = raw as Record<string, unknown> | null;
		if (!p || typeof p !== 'object') continue;
		const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
		const start = Number(p.start);
		const end = Number(p.end);
		if (!str('id') || !str('anchor') || !sourceIds.has(str('sourceId')) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
		out.push({ id: str('id'), sourceId: str('sourceId'), anchor: str('anchor'), start, end, words: str('words'), takes: str('takes') });
	}
	return out;
}

/** Keep only supported metadata. Legacy sources remain valid without either field. */
function parseSourceMetadata(value: Record<string, unknown>): Pick<DocumentSource, 'decision' | 'evidence'> {
	const result: Pick<DocumentSource, 'decision' | 'evidence'> = {};
	const decision = value.decision as Record<string, unknown> | null;
	if (decision && ['proposed', 'accepted', 'superseded'].includes(String(decision.status))) {
		result.decision = { status: decision.status as NonNullable<DocumentSource['decision']>['status'] };
	}
	const evidence = value.evidence as Record<string, unknown> | null;
	if (evidence && ['unit', 'integration', 'e2e', 'visual', 'load', 'manual', 'prototype'].includes(String(evidence.kind))
		&& ['passed', 'failed', 'blocked', 'not_run'].includes(String(evidence.result))) {
		const text = (key: string) => typeof evidence[key] === 'string' ? evidence[key] as string : '';
		result.evidence = {
			kind: evidence.kind as NonNullable<DocumentSource['evidence']>['kind'],
			result: evidence.result as NonNullable<DocumentSource['evidence']>['result'],
			buildId: text('buildId'), artifact: text('artifact'), command: text('command'),
			observedAt: text('observedAt'), provenance: text('provenance'),
			criterionIds: Array.isArray(evidence.criterionIds)
				? [...new Set(evidence.criterionIds.filter((id): id is string => typeof id === 'string' && !!id.trim()))] : []
		};
	}
	return result;
}
