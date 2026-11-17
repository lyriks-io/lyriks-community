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
	/** A flaw the solver proved that must be fixed before the model is ready. */
	blocking?: boolean;
	/** The chip of the card (Broken, Scenario fails, Dead end...); consumers fall back on `code`. */
	kindLabel?: string;
	/** What that kind of card means, in a sentence or two (criterion 4996a6b4). */
	kindMeaning?: string;
	/** The next move, when the advisory carries its own. */
	action?: string;
	/** The engine's counterexample or failing scenario, as Given / When / Then. */
	proof?: { given: string; when: readonly string[]; then: string };
	/** What the advisory stems from, shared by every advisory of one root (the score counts it once). */
	cause?: string;
	/** Listed but free: the engine could not reach it within its bound, or it follows from a cause counted on the same feature. */
	weighs?: 'unverified' | 'consequence';
	/** On the `capped` card: how many features this pass left unchecked (ac-leaf-ac-score-engine-reaches-all). */
	unchecked?: number;
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
	/**
	 * Bring the cached verification up to date and wait for it, for a reading
	 * that must not depend on how warm the cache is (ac-evo-coh-same-reading).
	 * Optional: an adapter without a cache is always up to date.
	 */
	prime?(projectId: string): Promise<void>;
	/**
	 * A behaviour batch just landed on the project: verify it behind without
	 * waiting for a reader (ac-leaf-ac-score-engine-reaches-all). Optional: an
	 * adapter without a cache verifies on every read anyway.
	 */
	touch?(projectId: string): void;
}
