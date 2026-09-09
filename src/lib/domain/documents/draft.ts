import type { DocumentKind } from './enums';

/**
 * One cited source: interviews, research, PDFs, diagrams, external links,
 * existing requirements, imported code, regulations, evidence. Deliberately
 * lightweight — `url` is a link (or reference), `note` a citation/excerpt. Any
 * spec object can point at one of these by stable id.
 */
export interface DocumentSource {
	readonly id: string;
	title: string;
	kind: DocumentKind;
	url: string;
	note: string;
}

export interface ProjectDocumentsDraft {
	projectId: string;
	sources: DocumentSource[];
	lastSavedAt: string | null;
}

export function createEmptyDocumentsDraft(projectId: string): ProjectDocumentsDraft {
	return { projectId, sources: [], lastSavedAt: null };
}

export function createDocumentSource(overrides: Partial<DocumentSource> = {}): DocumentSource {
	return { id: crypto.randomUUID(), title: '', kind: 'link', url: '', note: '', ...overrides };
}
