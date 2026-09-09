import type { GapSeverity } from '$domain/coherence';

/**
 * One advisory message distilled from the Unspaghettit behavior verification
 * surface (model-check invariant violations, failing scenarios, spec gaps). These
 * are *advisory* — best-effort, non-blocking — surfaced alongside the DPO and
 * semantic tiers in the coherence check and Control Center.
 */
export interface BehaviorAdvisory {
	/** Maps to `GapSeverity` so it folds straight into a coherence `Gap`. */
	severity: GapSeverity;
	title: string;
	detail: string;
	/** The unspa feature this concerns, when the message is feature-scoped. */
	featureId?: string;
	/** Human name of that feature, for consumer-crafted titles. */
	featureName?: string;
	/** Short machine tag for a stable gap id (`unspa-<code>-<i>`). */
	code: string;
	/**
	 * The critical spec gaps behind a `specgap` advisory, kept structured so
	 * consumers (the Issues board) can render one actionable item per gap
	 * instead of an opaque "Behavior gaps" blob.
	 */
	gaps?: { entityName: string; reason: string; suggestedFix: string }[];
}

/**
 * Read the current behavior advisories for a project. Implementations MUST be
 * cheap to call on every page load — the real unspa verify is heavy, so the
 * production adapter serves a cached snapshot and refreshes in the background
 * (pushing over the live-sync bus when the result changes). The port is the seam
 * the coherence checker reads through, so it never blocks navigation on the
 * engine.
 */
export interface BehaviorAdvisoryPort {
	get(projectId: string): Promise<BehaviorAdvisory[]>;
}
