import { MAX_IMPACT_DEPTH, type ImpactSection } from './enums';
import type { EvolutionRequest, ImpactFinding } from './draft';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The impact report: what a change propagates to, read under one of three
 * hypotheses.
 *
 * The three are read separately and never merged into one list, because removing
 * does not break what adding breaks. Everything below follows from that: the
 * hypothesis is part of the question, switching it throws the previous result
 * away rather than relabelling it, and the findings are stored per hypothesis.
 */

/** A propagation of depth zero returns the touched node, which the author already knows about. */
export function canComputePropagation(depth: number): Guarded {
	return firstRefusal(
		guard(
			depth < 1,
			'The depth must be at least one step.',
			'A propagation of depth zero returns the touched node itself, which the author already knows about.'
		),
		guard(
			depth > MAX_IMPACT_DEPTH,
			`The propagation stops at ${MAX_IMPACT_DEPTH} steps.`,
			'Beyond five steps nearly everything in the project is reachable, so the list stops separating what moves from what does not.'
		)
	);
}

/** The findings of the hypothesis currently on screen. */
export function findingsForCurrentHypothesis(request: EvolutionRequest): ImpactFinding[] {
	return request.impactFindings.filter((f) => f.hypothesis === request.impactReport.hypothesis);
}

/** The findings of one section of the list. The six sections are never mixed. */
export function findingsInSection(
	request: EvolutionRequest,
	section: ImpactSection
): ImpactFinding[] {
	return findingsForCurrentHypothesis(request).filter((f) => f.section === section);
}
