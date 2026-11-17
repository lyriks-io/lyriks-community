import {
	coherenceHeadline,
	createEmptyCoherenceDraft,
	type CoherenceAnalysis,
	type CoherenceHeadline,
	type ProjectCoherenceDraft
} from '$domain/coherence';
import type {
	CoherenceAnalysisOptions,
	CoherenceDraftRepositoryPort,
	GlobalCoherenceCheckerPort
} from '../ports';

export interface CoherenceView {
	draft: ProjectCoherenceDraft;
	analysis: CoherenceAnalysis;
	/**
	 * The coherence reading exactly as the Control Center prints it: the number,
	 * the word beside it, and what weighs most on it. The analysis alone carries
	 * readiness and the per-dimension table, so a client reading this project
	 * from outside the screen had to summarise the gap list on its own, against
	 * thresholds it guessed. It guessed differently, and reported a figure the
	 * person in front of the panel could not find anywhere.
	 */
	headline: CoherenceHeadline;
}

/**
 * Loads the persisted Step 09 authored state (threshold, acknowledgements,
 * generated artifacts) and the live analysis (dimensions, gaps, readiness)
 * from the global checker. The analysis is always recomputed — never trusted
 * from a previous save.
 */
export class LoadCoherenceDraftUseCase {
	constructor(
		private readonly drafts: CoherenceDraftRepositoryPort,
		private readonly checker: GlobalCoherenceCheckerPort
	) {}

	async execute(projectId: string, opts?: CoherenceAnalysisOptions): Promise<CoherenceView> {
		const [existing, analysis] = await Promise.all([
			this.drafts.load(projectId),
			this.checker.analyze(projectId, opts)
		]);
		return {
			draft: existing ?? createEmptyCoherenceDraft(projectId),
			analysis,
			headline: coherenceHeadline(analysis.gaps)
		};
	}
}
