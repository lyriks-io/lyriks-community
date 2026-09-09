import type { Option } from '$domain/shared';

/**
 * Kinds of source a specification can cite. A lightweight vocabulary — this is a
 * source *register*, not a document-management system: the bytes live elsewhere
 * (a link, or an already-uploaded brand file), Lyriks just records the citation.
 */
export const DOCUMENT_KINDS = [
	{ code: 'interview', label: 'Interview' },
	{ code: 'research', label: 'Research' },
	{ code: 'pdf', label: 'PDF' },
	{ code: 'diagram', label: 'Diagram' },
	{ code: 'link', label: 'External link' },
	{ code: 'requirement', label: 'Existing requirement' },
	{ code: 'code', label: 'Code / reverse-engineering' },
	{ code: 'regulation', label: 'Regulation / standard' },
	{ code: 'evidence', label: 'Evidence' },
	{ code: 'other', label: 'Other' }
] as const satisfies readonly Option[];
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['code'];
export const isDocumentKind = (v: unknown): v is DocumentKind =>
	typeof v === 'string' && (DOCUMENT_KINDS as readonly Option[]).some((k) => k.code === v);
