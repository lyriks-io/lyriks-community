import type { BehaviorRepositoryPort } from '../ports';

/**
 * Does another project already own the kernel record this feature id addresses?
 *
 * Lyriks stores behavior per project, one folder per project, but the engine
 * that authors it resolves a feature id across the whole workspace. When two
 * projects declare the same leaf id, one record answers to both: a batch sent
 * for project A can land in project B's record, and A keeps reading its own
 * folder, sees nothing authored, and blocks on `capability-behavior-missing`
 * with no way to tell why. This use case names the clash so a caller can refuse
 * the write while it is still a message instead of a silent cross-write.
 *
 * Returns the empty list whenever the id is unambiguous, and also when the
 * store cannot enumerate the workspace: an answer nobody can compute must read
 * as "no known clash", never as a refusal.
 */
export class DetectFeatureIdCollisionUseCase {
	constructor(private readonly behavior: BehaviorRepositoryPort) {}

	async execute(projectId: string, featureId: string): Promise<readonly string[]> {
		if (!projectId || !featureId) return [];
		if (!this.behavior.projectsHoldingFeature) return [];
		try {
			return await this.behavior.projectsHoldingFeature(projectId, featureId);
		} catch {
			// A scan that fails is a scan with nothing to say. Blocking an author's
			// batch on a broken read would trade a rare corruption for a common one.
			return [];
		}
	}
}
