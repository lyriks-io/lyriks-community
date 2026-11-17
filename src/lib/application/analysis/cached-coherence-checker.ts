import type { CoherenceAnalysis } from '$domain/coherence';
import type {
	CoherenceAnalysisOptions,
	GlobalCoherenceCheckerPort,
	ProjectModelRevisionPort
} from '../ports';
import { ProjectStateCache } from '../projection/project-state-cache';

/**
 * The local coherence analysis, computed once per state of the spec.
 *
 * Every page of a project and every card of the portfolio asks for it, and each
 * ask read every section and scored the behaviour of every feature: about 100 ms
 * on 280 features, on each navigation. A forced run computes whatever the state.
 *
 * Wraps the local checker alone: the formal verdict and the decisions on top of
 * it keep their own clocks.
 */
export class CachedCoherenceChecker implements GlobalCoherenceCheckerPort {
	readonly #readings: ProjectStateCache<CoherenceAnalysis>;

	constructor(
		private readonly inner: GlobalCoherenceCheckerPort,
		revision: ProjectModelRevisionPort,
		kernelSignature: (projectId: string) => string
	) {
		this.#readings = new ProjectStateCache(revision, kernelSignature);
	}

	analyze(projectId: string, opts?: CoherenceAnalysisOptions): Promise<CoherenceAnalysis> {
		return this.#readings.read(projectId, () => this.inner.analyze(projectId, opts), { force: opts?.force });
	}
}
