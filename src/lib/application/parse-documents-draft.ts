import {
	createEmptyDocumentsDraft,
	isDocumentKind,
	type DocumentSource,
	type ProjectDocumentsDraft
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
				...parseSourceMetadata(value)
			});
		}
	}
	return {
		...base,
		projectId,
		sources
	};
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
