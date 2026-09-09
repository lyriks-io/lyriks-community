import { createEmptySupervisionDraft, type ProjectSupervisionDraft } from '$domain/supervision';
import type { SupervisionDraftRepositoryPort } from '../ports';

/**
 * Loads the persisted Supervision draft, or an empty one. Supervision owns its
 * own board (assignments, policy, decisions), so this is a thin load — the
 * read-only activity feed and gateway audit are mirrored in from telemetry at
 * the edge and stored alongside the authored data.
 */
export class LoadSupervisionDraftUseCase {
	constructor(private readonly drafts: SupervisionDraftRepositoryPort) {}

	async execute(projectId: string): Promise<ProjectSupervisionDraft> {
		const existing = await this.drafts.load(projectId);
		return existing ?? createEmptySupervisionDraft(projectId);
	}
}
