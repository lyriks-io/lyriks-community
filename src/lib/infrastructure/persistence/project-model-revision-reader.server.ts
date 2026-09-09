import type {
	DraftLockPort,
	ProjectModelRevisionPort,
	SectionDocumentStorePort
} from '$application/ports';
import { fingerprint } from '$domain/scope';

/**
 * Combines the revision channels used by legacy/kernel sections and consolidated
 * section documents. Reading both is deliberate: every save architecture is
 * covered while contexts continue their gradual persistence migration.
 */
export class ProjectModelRevisionReader implements ProjectModelRevisionPort {
	constructor(
		private readonly sections: readonly string[],
		private readonly documents: SectionDocumentStorePort,
		private readonly locks: DraftLockPort
	) {}

	async fingerprint(projectId: string): Promise<string> {
		const revisions = await Promise.all(
			this.sections.map(async (section) => {
				const [document, legacy] = await Promise.all([
					this.documents.currentRevision(projectId, section),
					this.locks.current(projectId, section)
				]);
				return { section, document, legacy };
			})
		);
		return fingerprint(revisions);
	}
}
