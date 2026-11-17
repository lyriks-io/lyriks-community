import { conformanceOf, type Conformance } from '$domain/coherence';
import type { FeatureImplementationCoverage } from './load-implementation-coverage';

/**
 * Where the per-feature implementation coverage is read from. The composition
 * root hands in the cached tier, so this read is instant and never waits on the
 * engine: a stale snapshot refreshes in the background and says so on its own
 * live-sync key.
 */
export interface ImplementationCoverageReader {
	get(projectId: string): Promise<Readonly<Record<string, FeatureImplementationCoverage>>>;
}

/**
 * Proven against code for one project (feat-control-center, "Measure what is
 * proven against the code"): read beside the coherence headline, on Project
 * health and in the coherence section an agent reads, and never folded into the
 * coherence score. The same coverage snapshot the Features chips and the
 * retro-spec summary read, so the counts cannot disagree with them.
 */
export class LoadConformanceUseCase {
	constructor(private readonly coverage: ImplementationCoverageReader) {}

	async execute(projectId: string): Promise<Conformance> {
		const rows = await this.coverage.get(projectId);
		return conformanceOf(Object.values(rows));
	}
}
