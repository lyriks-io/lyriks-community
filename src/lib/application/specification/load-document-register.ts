import { createEmptyDocumentsDraft, type DocumentSource, type ProjectDocumentsDraft } from '$domain/documents';
import type { DocKind, ReferenceDoc } from '$domain/architecture';
import type { ArchitectureDraftRepositoryPort, SectionDraftRepositoryPort } from '../ports';

/**
 * The project's evidence register, as every citing context sees it.
 *
 * Documents & Sources is the single source of truth for evidence. Architecture
 * used to keep a second, private list ("Attached reference docs"); those rows
 * are folded in here by id so that history is not lost and the register is
 * complete everywhere it is offered. The fold is read-side and idempotent —
 * ids are preserved, so once the documents section is saved the legacy copy
 * dedupes away instead of doubling.
 */

/** Legacy architecture doc kinds mapped onto the register's vocabulary. */
const KIND_OF_LEGACY_DOC: Record<DocKind, DocumentSource['kind']> = {
	docs: 'link',
	api: 'link',
	guide: 'research',
	legal: 'regulation',
	other: 'other'
};

/** One legacy architecture reference doc, as a register row with the same id. */
function asSource(doc: ReferenceDoc): DocumentSource {
	return {
		id: doc.id,
		title: doc.title,
		kind: KIND_OF_LEGACY_DOC[doc.kind] ?? 'other',
		url: doc.url,
		note: doc.description
	};
}

/** Register rows win over the legacy copy of the same id (they are editable). */
export function foldLegacyReferenceDocs(
	sources: readonly DocumentSource[],
	legacy: readonly ReferenceDoc[]
): DocumentSource[] {
	const known = new Set(sources.map((source) => source.id));
	return [...sources, ...legacy.filter((doc) => !known.has(doc.id)).map(asSource)];
}

/**
 * The register draft, folded. EVERY reader goes through this — the Documents
 * page that edits it and every citation control that links to it — so the page
 * and the pickers can never show different lists. (Editing anything on the
 * Documents page then persists the folded rows, which is what retires the
 * legacy copy for good.)
 */
export class LoadDocumentRegisterUseCase {
	constructor(
		private readonly documents: Pick<SectionDraftRepositoryPort<ProjectDocumentsDraft>, 'load'>,
		private readonly architecture: Pick<ArchitectureDraftRepositoryPort, 'load'>
	) {}

	async execute(projectId: string): Promise<ProjectDocumentsDraft> {
		const [documents, architecture] = await Promise.all([
			this.documents.load(projectId),
			this.architecture.load(projectId)
		]);
		const draft = documents ?? createEmptyDocumentsDraft(projectId);
		return {
			...draft,
			sources: foldLegacyReferenceDocs(draft.sources, architecture?.referenceDocs ?? [])
		};
	}
}
