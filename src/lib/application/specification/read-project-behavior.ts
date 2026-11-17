import type { ProjectBehavior, UnspaghettitAdvisorPort } from '$application/ports';
import type { ProjectStateCache } from '../projection/project-state-cache';

/**
 * What the engine holds for a project beyond its features.
 *
 * Answered by the engine's one subprocess, which reads the whole project each
 * time and makes every other question wait behind it: about 300 ms, twice on a
 * feature's page. So it is asked once per state of the spec. No answer (the
 * engine down, the project unknown to it) is never kept.
 */
export class ReadProjectBehaviorUseCase {
	constructor(
		private readonly advisor: Pick<UnspaghettitAdvisorPort, 'readProjectBehavior'>,
		private readonly readings: ProjectStateCache<ProjectBehavior | null>
	) {}

	execute(projectId: string): Promise<ProjectBehavior | null> {
		return this.readings.read(projectId, () => this.advisor.readProjectBehavior(projectId), {
			keep: (behavior) => behavior !== null
		});
	}
}
