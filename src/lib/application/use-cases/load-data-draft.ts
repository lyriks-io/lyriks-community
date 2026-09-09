import { createEmptyDataDraft, type ProjectDataDraft } from '$domain/data';
import type { DataDraftRepositoryPort, ExperienceDraftRepositoryPort } from '../ports';
import { buildDerivedEntities } from '../build-derived-entities';

/**
 * Loads the persisted Step 07 draft (or an empty one) and refreshes its
 * read-only `derivedEntities` from how the Step 05 journeys consume data. The
 * derived set is never authored here — recomputed on every load so the data
 * model always knows which tables the behavior expects.
 */
export class LoadDataDraftUseCase {
	constructor(
		private readonly drafts: DataDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort
	) {}

	async execute(projectId: string): Promise<ProjectDataDraft> {
		const [existing, experience] = await Promise.all([
			this.drafts.load(projectId),
			this.experienceDrafts.load(projectId)
		]);
		const draft = existing ?? createEmptyDataDraft(projectId);
		return { ...draft, derivedEntities: buildDerivedEntities(experience) };
	}
}
