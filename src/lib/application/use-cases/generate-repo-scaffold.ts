import { generateRepoScaffold, type RepoScaffold, type TargetMap } from '$domain/experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';

/**
 * Produce a drop-in acceptance bundle (specs + config + CI + map + README) for
 * any repo — the provider-agnostic delivery of the prototype's contract. An
 * optional `map` retargets it onto an existing codebase. Read-only.
 */
export class GenerateRepoScaffoldUseCase {
	constructor(private readonly loadExperience: LoadExperienceDraftUseCase) {}

	async execute(projectId: string, map?: TargetMap): Promise<RepoScaffold> {
		const draft = await this.loadExperience.execute(projectId);
		return generateRepoScaffold(draft, map);
	}
}
