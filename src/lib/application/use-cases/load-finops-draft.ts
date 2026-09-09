import { createEmptyFinopsDraft, type ProjectFinopsDraft } from '$domain/finops';
import type { FinopsDraftRepositoryPort } from '../ports';

/**
 * Loads the persisted AI Cost Governor draft, or an empty one. The governor owns
 * its authored levers (budget, thresholds, enforcement, compiled rules); the
 * live readiness/coherence signals it reacts to are recomputed at the edge and
 * passed to the page separately, never stored here.
 */
export class LoadFinopsDraftUseCase {
	constructor(private readonly drafts: FinopsDraftRepositoryPort) {}

	async execute(projectId: string): Promise<ProjectFinopsDraft> {
		const existing = await this.drafts.load(projectId);
		return existing ?? createEmptyFinopsDraft(projectId);
	}
}
