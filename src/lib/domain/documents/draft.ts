import { mintUuid } from '../shared';
import type { DocumentKind } from './enums';
import type { SourcePassage, StoredText } from './passages';

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
	/** Authored decision status, not an inferred acceptance or a runtime result. */
	decision?: { status: 'proposed' | 'accepted' | 'superseded' };
	/** The text Unspag stores for this source, by reference: the register never keeps its bytes (criterion 81dffe4f). */
	stored?: StoredText;
	/** Reported execution evidence; never contributes to model coverage by itself. */
	evidence?: {
		kind: 'unit' | 'integration' | 'e2e' | 'visual' | 'load' | 'manual' | 'prototype';
		result: 'passed' | 'failed' | 'blocked' | 'not_run';
		buildId: string;
		artifact: string;
		command: string;
		observedAt: string;
		provenance: string;
		criterionIds: string[];
	};
}

export interface ProjectDocumentsDraft {
	projectId: string;
	sources: DocumentSource[];
	/** The passages of stored source texts the elements rest on (criterion f09da92d). */
	passages?: SourcePassage[];
	lastSavedAt: string | null;
}

export function createEmptyDocumentsDraft(projectId: string): ProjectDocumentsDraft {
	return { projectId, sources: [], lastSavedAt: null };
}

export function createDocumentSource(overrides: Partial<DocumentSource> = {}): DocumentSource {
	return { id: mintUuid(), title: '', kind: 'link', url: '', note: '', ...overrides };
}
