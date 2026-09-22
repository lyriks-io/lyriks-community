import { coherenceScoreOf, penaltyOf } from './incoherence';
import type { Gap } from './draft';

/**
 * What the Control Center puts at the top of the panel, as one value.
 *
 * WHY THIS EXISTS. An agent working through the MCP could read `readinessScore`
 * and the per-dimension table, but nothing gave it the COHERENCE headline and
 * the word beside it: the very number a person is looking at while they talk to
 * it. So an agent could finish a spec, report the completion audit at 100, and
 * be corrected by a screenshot showing 59 "Critical". A number the product
 * displays and the API withholds is a number the assistant will contradict.
 *
 * It is one function on purpose, used by the panel AND by the section read, so
 * the headline cannot drift between what is shown and what is reported. Pure:
 * it derives everything from the open gaps and nothing is declared by hand.
 */

export type CoherenceVerdict = 'strong' | 'watch' | 'critical';

export interface CoherenceHeadline {
	/** The product-level coherence score, 0 to 100. */
	score: number;
	/** The word shown beside it. */
	verdict: CoherenceVerdict;
	/** How many incoherences are open. */
	total: number;
	/** How many of them hold the build gate and cannot be settled by a decision. */
	blocking: number;
	/** How many weigh most: the panel's own legend says these are what matter. */
	highSeverity: number;
	/** What each open gap costs the score, highest first: what to fix to move it. */
	weighsMost: { id: string; title: string; costs: number }[];
}

/**
 * The word, from what the list HOLDS rather than from how long it is.
 *
 * "Critical" is reserved for something blocking or high severity. Without that
 * floor the word tracks volume: a register of low and medium findings reads as
 * a product in distress purely because someone took the trouble to write them
 * down, which contradicts the panel's own legend and teaches the reader to skip
 * the word. Thresholds are the spec's (feat-health-scores, "Open one reading").
 */
export function verdictFor(score: number, blocking: number, highSeverity: number): CoherenceVerdict {
	if (score >= 67) return 'strong';
	if (score < 34 && (blocking > 0 || highSeverity > 0)) return 'critical';
	return 'watch';
}

/** The headline for a set of open gaps. */
export function coherenceHeadline(gaps: readonly Gap[]): CoherenceHeadline {
	const score = coherenceScoreOf(gaps);
	const blocking = gaps.filter((g) => g.blocking).length;
	const highSeverity = gaps.filter((g) => g.severity === 'high').length;
	const weighsMost = gaps
		.map((g) => ({ id: g.id, title: g.title, costs: Math.round(penaltyOf(g) * 10) / 10 }))
		.sort((a, b) => b.costs - a.costs || a.id.localeCompare(b.id))
		.slice(0, 5);
	return {
		score,
		verdict: verdictFor(score, blocking, highSeverity),
		total: gaps.length,
		blocking,
		highSeverity,
		weighsMost
	};
}
