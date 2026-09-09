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
				note: typeof value.note === 'string' ? value.note : ''
			});
		}
	}
	return {
		...base,
		projectId,
		sources
	};
}
