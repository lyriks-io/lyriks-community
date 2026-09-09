/**
 * What stands between a feature and its next readiness level.
 *
 * The TRL badge is a projection of the engine's maturity percentage, so a user
 * looking at "TRL 5" has no way to know what would make it a 6. This turns the
 * same reading into a to-do list: the shortest set of failed checks that, once
 * passed, moves the badge up.
 *
 * Pure and generic over the check type: the ladder mapping is passed in rather
 * than re-implemented, because a second copy of the formula is exactly how the
 * platform and the engine drifted apart before.
 */

/** The reading this plans over. Structural on purpose, so the domain layer
 *  depends on no port type. */
export interface MaturityReading<TCheck> {
	/** Checks passed. */
	readonly score: number;
	/** Checks applicable. */
	readonly maxScore: number;
	/** The failed ones, in the order they should be tackled. */
	readonly issues: readonly TCheck[];
}

export interface TrlPlan<TCheck> {
	/** Level the current score maps to. */
	readonly currentLevel: number;
	/** Level reached once `nextSteps` all pass; null when nothing can move it. */
	readonly nextLevel: number | null;
	/** How many more checks must pass to get there. 0 when nextLevel is null. */
	readonly checksToNextLevel: number;
	/** The checks that make up that shortest path, in order. */
	readonly nextSteps: readonly TCheck[];
	/** The failed checks beyond that path: real debt, just not on the way up. */
	readonly laterSteps: readonly TCheck[];
	/**
	 * Whether the failed checks fully explain the missing points. False when the
	 * scorer floors a reading instead of enumerating it (a feature with no
	 * surface is held at 0 while naming only "add a surface"), and a caller must
	 * then present the steps as what to fix FIRST, not as a level promise: the
	 * arithmetic behind that promise does not hold.
	 */
	readonly exhaustive: boolean;
}

/**
 * Walks the score up one passed check at a time and stops at the first that
 * lands on a higher level. Iterating instead of inverting the formula keeps
 * this correct whatever rounding the ladder does, and the loop is bounded by
 * the number of checks a single feature has.
 *
 * `trlOf` is the same projection the badge uses (percentage to 1-9).
 */
export function planNextTrl<TCheck>(
	reading: MaturityReading<TCheck>,
	trlOf: (percentage: number) => number
): TrlPlan<TCheck> {
	const { score, maxScore, issues } = reading;
	const pct = (passed: number) =>
		maxScore <= 0 ? 100 : Math.round((passed / maxScore) * 100);
	const currentLevel = trlOf(pct(score));
	const exhaustive = issues.length >= maxScore - score;
	const nothingToDo: TrlPlan<TCheck> = {
		currentLevel,
		nextLevel: null,
		checksToNextLevel: 0,
		nextSteps: [],
		laterSteps: issues,
		exhaustive
	};
	if (maxScore <= 0 || score >= maxScore) return nothingToDo;

	for (let extra = 1; extra <= maxScore - score; extra += 1) {
		const level = trlOf(pct(score + extra));
		if (level <= currentLevel) continue;
		// Every check weighs 1, so `extra` checks passed is `extra` issues cleared.
		// Clamped for the floored readings above, which name fewer issues than
		// they hold back points.
		const take = Math.min(extra, issues.length);
		return {
			currentLevel,
			nextLevel: level,
			checksToNextLevel: extra,
			nextSteps: issues.slice(0, take),
			laterSteps: issues.slice(take),
			exhaustive
		};
	}
	// Passing every remaining check still maps to the same level (the top one).
	return nothingToDo;
}
