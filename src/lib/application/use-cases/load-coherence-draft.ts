import {
	createEmptyCoherenceDraft,
	type CoherenceAnalysis,
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
		return { draft: existing ?? createEmptyCoherenceDraft(projectId), analysis };
	}
}
