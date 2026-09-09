import type { CoherenceAnalysis } from '$domain/coherence';

/** Options for a coherence run. */
export interface CoherenceAnalysisOptions {
	/**
	 * Force a fresh *synchronous* recompute of the formal DPO engine (the heavy
	 * `POST …/coherence {mode:'sync',force:true}`). Set ONLY by the explicit
	 * "Run coherence check" button. Automatic page loads leave this off so they
	 * read the cheap cached verdict — the DPO layer still shows up on load
	 * without a click, but navigation never blocks on a full engine recompute.
	 */
	force?: boolean;
}

/**
 * The seam for the global coherence analysis. The local adapter aggregates
 * Steps 01-08 and detects gaps with deterministic heuristics; the future
 * `GrpcGlobalCoherenceChecker` (Lyriks-back → Rust DPO engine) implements the
 * SAME port, so swapping the formal checker in is a one-line change in the
 * composition root. This is where "Run coherence check" delegates.
 */
export interface GlobalCoherenceCheckerPort {
	analyze(projectId: string, opts?: CoherenceAnalysisOptions): Promise<CoherenceAnalysis>;
}
