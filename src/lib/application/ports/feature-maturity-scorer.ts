import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

/**
 * One check the engine's scorer ran and the feature failed, with the navigation
 * hints needed to jump straight at the thing to fix. Re-declared platform-side
 * (it mirrors the engine's `MaturityIssue`) so the port stays the boundary and
 * the UI never imports engine types.
 */
export interface FeatureMaturityIssue {
	/** Name of what failed: the feature, a surface, or an action. */
	readonly target: string;
	readonly targetKind: 'feature' | 'surface' | 'action';
	/** Which family of check: `rules`, `effects`, `permissions`, and so on. */
	readonly area: string;
	/** What to do about it, in the engine's own words. */
	readonly message: string;
	readonly severity: 'critical' | 'recommended';
	readonly surfaceId?: string;
	readonly actionId?: string;
}

/**
 * The score AND what it is made of, so a caller can tell a user which checks
 * stand between the current level and the next one, instead of only how far
 * along they are. `score` counts checks passed out of `maxScore` applicable.
 */
export interface FeatureMaturityReport {
	readonly score: number;
	readonly maxScore: number;
	/** `round(score / maxScore * 100)`: the 0-100 the TRL ladder maps. */
	readonly percentage: number;
	/** Failed checks, critical first. Empty when the feature passes everything. */
	readonly issues: readonly FeatureMaturityIssue[];
}

/**
 * Outbound port for behavioral maturity — how complete one feature's authored
 * Unspaghettit shell is, 0-100.
 *
 * Injected rather than computed here because the heuristic BELONGS to the
 * engine: it owns the checks, their weights, and what counts as critical. The
 * platform used to re-implement them, and the two formulas had silently drifted
 * apart (a fully authored feature scored 80 locally against the engine's 96-100,
 * a surface-less shell 10-20 against the engine's 0) — so the number the UI
 * showed was not the number the engine would defend.
 */
export interface FeatureMaturityScorerPort {
	/** 0-100 for one feature's snapshot; 0 when it has no authored shell. */
	score(snapshot: UnspaFeatureSnapshot | null): number;
	/**
	 * The same reading with the failed checks behind it, for a caller that has
	 * to show what is missing. Null when there is no shell to score at all.
	 */
	report(snapshot: UnspaFeatureSnapshot | null): FeatureMaturityReport | null;
}
