import type {
	SectionDocumentStorePort,
	SectionDraftRepositoryPort,
	SectionDraftSaveOptions
} from '$application/ports';

/**
 * Typed per-section view over the consolidated section-document store: pins the
 * section key and sanitises the stored document back through the section's
 * anti-corruption `parse` on load. Successor of the dedicated per-section
 * tables (and the residue rows) for the simple sections — saves are atomic
 * compare-and-write with the revision in-row.
 */
export class SectionDocumentDraftRepository<T extends { projectId: string }>
	implements SectionDraftRepositoryPort<T>
{
	constructor(
		private readonly store: SectionDocumentStorePort,
		private readonly section: string,
		private readonly parse: (raw: unknown, projectId: string) => T
	) {}

	async load(projectId: string): Promise<T | null> {
		const raw = await this.store.load(projectId, this.section);
		return raw == null ? null : this.parse(raw, projectId);
	}

	async save(draft: T, opts?: SectionDraftSaveOptions): Promise<number | null> {
		return this.store.save(
			draft.projectId,
			this.section,
			draft,
			opts?.expectedRevision ?? null,
			opts?.origin ?? null
		);
	}

	currentRevision(projectId: string): Promise<number> {
		return this.store.currentRevision(projectId, this.section);
	}
}
