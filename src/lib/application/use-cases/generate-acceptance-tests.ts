import { generateAcceptanceTests, type AcceptanceTests, type TargetMap } from '$domain/experience';
import type { LoadExperienceDraftUseCase } from './load-experience-draft';

/**
 * Generate runnable acceptance tests (Gherkin + Playwright) from the prototype —
 * the artifact that carries simulator verification into the build. Read-only. An
 * optional `map` retargets the same spec onto an EXISTING codebase (real routes /
 * selectors / observables) with no git provider needed.
 */
export class GenerateAcceptanceTestsUseCase {
	constructor(private readonly loadExperience: LoadExperienceDraftUseCase) {}

	async execute(projectId: string, map?: TargetMap): Promise<AcceptanceTests> {
		const draft = await this.loadExperience.execute(projectId);
		return generateAcceptanceTests(draft, map);
	}
}
