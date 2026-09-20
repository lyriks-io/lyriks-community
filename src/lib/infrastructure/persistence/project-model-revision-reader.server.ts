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
 *
 * The fingerprint keys every cached reading of the model (the knowledge graph,
 * the completion evidence), so it is taken on every read of those. When the
 * stores can hand back a project's revisions in one query each, that is two
 * queries per fingerprint instead of two per section; the value is the same
 * either way, so a store that cannot batch simply costs more, never differs.
 */
export class ProjectModelRevisionReader implements ProjectModelRevisionPort {
	constructor(
		private readonly sections: readonly string[],
		private readonly documents: SectionDocumentStorePort,
		private readonly locks: DraftLockPort
	) {}

	async fingerprint(projectId: string): Promise<string> {
		const [documents, legacy] = await Promise.all([
			this.#documentRevisions(projectId),
			this.#legacyRevisions(projectId)
		]);
		const revisions = this.sections.map((section) => ({
			section,
			document: documents.get(section) ?? 0,
			legacy: legacy.get(section) ?? 0
		}));
		return fingerprint(revisions);
	}

	async #documentRevisions(projectId: string): Promise<ReadonlyMap<string, number>> {
		if (this.documents.currentRevisions) return this.documents.currentRevisions(projectId);
		return this.#eachSection((section) => this.documents.currentRevision(projectId, section));
	}

	async #legacyRevisions(projectId: string): Promise<ReadonlyMap<string, number>> {
		if (this.locks.currentRevisions) return this.locks.currentRevisions(projectId);
		return this.#eachSection((section) => this.locks.current(projectId, section));
	}

	async #eachSection(read: (section: string) => Promise<number>): Promise<Map<string, number>> {
		const entries = await Promise.all(
			this.sections.map(async (section) => [section, await read(section)] as const)
		);
		return new Map(entries);
	}
}
