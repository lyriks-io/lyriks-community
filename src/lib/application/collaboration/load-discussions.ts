import { parseDiscussions, type DiscussionsDocument } from '$domain/discussions';
import type { SectionDocumentStorePort } from '../ports/section-documents';

/**
 * Reads a project's Specification 360° discussions: the stored document, read
 * through the discussions context's edge, and the revision a write must name.
 * The revision is read first, so a concurrent write can only make it stale
 * (refused, then retried), never newer than the document returned.
 */
export class LoadDiscussionsUseCase {
	constructor(
		private readonly store: SectionDocumentStorePort,
		/** The internal section the discussions are kept under. */
		private readonly section: string
	) {}

	async execute(projectId: string): Promise<{ document: DiscussionsDocument; revision: number }> {
		const revision = await this.store.currentRevision(projectId, this.section);
		const raw = await this.store.load(projectId, this.section);
		return { document: parseDiscussions(raw), revision };
	}
}
