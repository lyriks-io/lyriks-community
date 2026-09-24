import type { Actor, EvolutionRequest, ImplementationFinding } from './draft';
import type { DerivationSource, ImplementationVerdict } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';

/**
 * The five-verdict implementation report, and the decisions that dispose of it.
 *
 * The rule everything else hangs off: the report is derived by crossing the
 * SPECIFIED requirements with the implementation coverage and reading the code
 * anchors of the touched spans. It is never derived from the agent's own account
 * of what it did, because that is a claim rather than evidence, and it hides
 * exactly the omissions and additions the report exists to surface.
 */

/** Conform, non-conform and missing come from the crossing. Any other source blocks the build. */
export function canBuildReport(source: DerivationSource): Guarded {
	return guard(
		source === 'agent_account',
		'A report cannot be derived from the agent own summary of its work.',
		'The summary written by the agent that did the work is a claim, not evidence, and it hides exactly the omissions and additions the report exists to surface.'
	);
}

/**
 * The verdict a line carries, derived rather than declared.
 *
 * - A span with **no requirement anchor** is what the model added of its own
 *   accord: out of scope.
 * - A touched span anchored to **another leaf** is a regression, detected by
 *   comparing against the code anchors of other leaves rather than by the
 *   demanded-versus-realised matrix.
 * - Otherwise the line sits in the crossing: conform when a passing acceptance
 *   test proves the code does what the spec says, missing when nothing was
 *   located, non-conform when something was located but does not match.
 */
export function deriveVerdict(input: {
	hasRequirementAnchor: boolean;
	anchorForeignLeaf: boolean;
	locatedInCode: boolean;
	acceptanceTestPassing: boolean;
}): ImplementationVerdict {
	if (input.anchorForeignLeaf) return 'regression';
	if (!input.hasRequirementAnchor) return 'out_of_scope';
	if (!input.locatedInCode) return 'missing';
	return input.acceptanceTestPassing ? 'conform' : 'non_conform';
}

/** A verdict with no file behind it cannot be reviewed, so it is never emitted. */
export function isReviewable(finding: ImplementationFinding): boolean {
	return finding.filePath.trim() !== '';
}

/** The diff opens only on a line that carries its file path. */
export function canUnfoldDiff(finding: ImplementationFinding): Guarded {
	return guard(
		!isReviewable(finding),
		'This line has no file behind it.',
		'A diff can only be opened against a file path and a line range. A line without them is not reviewable and should never have been emitted.'
	);
}

/** Conform means the code was proven to do what the spec says. */
export function canMarkConform(finding: ImplementationFinding): Guarded {
	return guard(
		!finding.acceptanceTestPassing,
		'No passing acceptance test is attached to this line.',
		'Conform means the code was proven to do what the spec says. Without a passing test the claim rests on nobody word.'
	);
}

/** Only a span with no requirement anchor can be flagged out of scope. */
export function canFlagOutOfScope(finding: ImplementationFinding): Guarded {
	return guard(
		finding.hasRequirementAnchor,
		'This span is anchored to a requirement, so it is in scope.',
		'Out of scope is derived from code spans that carry no requirement anchor. An anchored span belongs in the demanded-versus-realised crossing instead.'
	);
}

/** Only a touched span anchored to another leaf can be flagged as a regression. */
export function canFlagRegression(finding: ImplementationFinding): Guarded {
	return guard(
		!finding.anchorForeignLeaf,
		'This span belongs to the request own leaf, so it is not a regression.',
		'Regression concerns neighbouring features. It is detected by comparing touched spans against the code anchors of other leaves, not by the demanded-versus-realised matrix.'
	);
}

/** A line this request answers for: everything but what the touched features already held. */
export const isRequestLine = (line: ImplementationFinding): boolean => line.scope !== 'inherited';

/**
 * How many lines of the current iteration still carry no decision and hold
 * the report open. Inherited lines are the touched features' own standing:
 * they are shown, and decidable, but a change is not held hostage to the
 * backlog of the feature it amends.
 */
export function undecidedCount(request: EvolutionRequest): number {
	return currentLines(request).filter((l) => isRequestLine(l) && l.decision === 'undecided').length;
}

/** Inherited lines still undecided: context, never a gate. */
export function inheritedUndecidedCount(request: EvolutionRequest): number {
	return currentLines(request).filter((l) => !isRequestLine(l) && l.decision === 'undecided').length;
}

/** The report lines of the iteration in flight. Past iterations keep their own. */
export function currentLines(request: EvolutionRequest): ImplementationFinding[] {
	return request.implementationFindings.filter((l) => l.iteration === request.iteration);
}

/** The lines of one bucket, which is the only batch the panel ever offers. */
export function linesInBucket(
	request: EvolutionRequest,
	verdict: ImplementationVerdict
): ImplementationFinding[] {
	return currentLines(request).filter((l) => l.verdict === verdict);
}

const reportStatus = (request: EvolutionRequest): 'building' | 'ready' | 'closed' =>
	request.iterations.find((i) => i.number === request.iteration)?.reportStatus ?? 'building';

/**
 * Every line offers validate and invalidate; only an out-of-scope line also
 * offers adopt and remove. All four need an open report and a named author,
 * because an unattributed decision cannot be recorded in the history, and a
 * decision that cannot be recorded cannot be taken.
 */
export function canDecide(request: EvolutionRequest, actor: Actor): Guarded {
	return firstRefusal(
		guard(
			reportStatus(request) === 'closed',
			'The report is closed.',
			'A closed report is a settled account of an iteration. Reopening it would rewrite history rather than add to it.'
		),
		guard(
			actor.id.trim() === '',
			'The decision names no author.',
			'Every decision is recorded in the history with its author and its timestamp. An unattributed decision cannot be recorded, so it cannot be taken.'
		)
	);
}

/**
 * Adoption exists to absorb what nobody asked for: writing the missing
 * acceptance criterion into its canonical section, which turns the line conform.
 * A line already crossed against a requirement has its criterion, so there is
 * nothing to write.
 */
export function canAdopt(request: EvolutionRequest, actor: Actor, line: ImplementationFinding): Guarded {
	return firstRefusal(
		canDecide(request, actor),
		guard(
			line.verdict !== 'out_of_scope',
			'Only an out-of-scope line can be adopted into the spec.',
			'Adoption exists to absorb what nobody asked for. A line already crossed against a requirement has its criterion; there is nothing to write.'
		)
	);
}

/** Removal is the other half of the out-of-scope choice. */
export function canRemove(request: EvolutionRequest, actor: Actor, line: ImplementationFinding): Guarded {
	return firstRefusal(
		canDecide(request, actor),
		guard(
			line.verdict !== 'out_of_scope',
			'Only an out-of-scope line can be removed from the code this way.',
			'Removal is the other half of the out-of-scope choice. A conform or non-conform line is corrected through a rebrief, not deleted.'
		)
	);
}

/**
 * Adopting an out-of-scope line writes into the spec, so the spec changed. The
 * report waits for the amended spec to pass the Challenge check again: true
 * while an adoption is more recent than the last coherence run.
 */
export function rechallengePending(request: EvolutionRequest): boolean {
	const ranAt = request.coherenceReport.status === 'ready' ? request.coherenceReport.ranAt : null;
	return currentLines(request).some(
		(l) => l.decision === 'adopted' && (ranAt === null || (l.decidedAt ?? '') > ranAt)
	);
}

/**
 * An undecided line is drift left in the open, so the report cannot be closed.
 * Neither can a report that was never built: no line to decide is not the same
 * answer as every line decided, and reading it as one would send a request past
 * implementation without the crossing of requirements with code ever having run.
 * And a report whose adoption amended the spec waits for that spec to be
 * challenged again.
 */
export function canCloseReport(request: EvolutionRequest): Guarded {
	return firstRefusal(
		guard(
			currentLines(request).length === 0,
			'No report has been built for this iteration yet.',
			'A report with no line is one that never ran, and passing it as settled would put the whole point of the stage, the crossing of what was asked with what was built, behind a formality.'
		),
		guard(
			undecidedCount(request) > 0,
			'Lines of this report are still undecided.',
			'An undecided line is drift left in the open: the spec would stop describing the product without anyone having said so.'
		),
		guard(
			rechallengePending(request),
			'An adoption amended the spec. Run the Challenge check again, coherence and docking, before closing this report.',
			'A report that changed the spec is not settled until the changed spec was challenged again.'
		)
	);
}

/**
 * The brief for the next attempt, for ONE refused line, machine-written from
 * what the report already holds: what the spec expects, what the code does,
 * where, and what to do. Sits under the verdict, ready to copy for the coding
 * agent. The conform lines are named as untouchable, because the second
 * attempt otherwise tends to break what the first one got right.
 */
export function lineBrief(request: EvolutionRequest, line: ImplementationFinding): string {
	const untouched = protectedLineIds(request);
	const what =
		line.verdict === 'missing'
			? 'Implement it: nothing was located for this requirement.'
			: line.verdict === 'regression'
				? 'Undo the change to this span: it belongs to another feature and was not asked for.'
				: line.verdict === 'out_of_scope'
					? 'Remove it: nothing in the spec asked for it.'
					: 'Make the code do what the spec says, then attach the passing acceptance test.';
	return [
		`Request: ${request.title} (iteration ${request.iteration}, spec version ${request.specVersion || 'unversioned'})`,
		`Line: ${line.id} [${line.verdict.replace('_', ' ')}]`,
		`Where: ${line.filePath}${line.lineRange ? `:${line.lineRange}` : ''}`,
		`The spec expects: ${line.specStatement || line.requirement}`,
		`The code does: ${line.codeStatement || 'nothing was located'}`,
		`What to do: ${what}`,
		untouched.length > 0
			? `Leave untouched (conform): ${untouched.join(', ')}`
			: 'Leave untouched: nothing is conform yet.'
	].join('\n');
}

/**
 * The rebrief: the refused lines become the instruction for the next attempt,
 * and the conform lines are named as untouchable, because the second attempt
 * otherwise tends to break what the first one got right.
 */
export function canComposeRebrief(request: EvolutionRequest): Guarded {
	const refused = currentLines(request).filter((l) => l.decision === 'invalidated').length;
	return firstRefusal(
		guard(
			undecidedCount(request) > 0,
			'The report still holds undecided lines.',
			'A rebrief is built out of decisions. Composing one before every line is disposed of would ask for changes nobody has agreed to.'
		),
		guard(
			refused < 1,
			'No line was refused, so there is nothing to rebrief.',
			'A brief with no refused line carries no instruction; it would only repeat a request that was already honoured.'
		)
	);
}

/** The conform lines a rebrief must name as untouchable. */
export function protectedLineIds(request: EvolutionRequest): string[] {
	return currentLines(request)
		.filter((l) => l.verdict === 'conform')
		.map((l) => l.id);
}

/**
 * Amending the spec sends the request back to stage 1 and CLOSES the coherence
 * gate again, so the amended spec is challenged before anything is implemented
 * against it. Implementing against a spec that skipped that challenge is what
 * produced the refused lines in the first place.
 */
export function canAmendSpec(request: EvolutionRequest): Guarded {
	return guard(
		undecidedCount(request) > 0,
		'The report still holds undecided lines.',
		'Amending the spec on top of an undecided report would lose the link between what was refused and what is asked next.'
	);
}

/** No new implementation starts while the stage 2 gate is closed. */
export function canSendBackForImplementation(request: EvolutionRequest): Guarded {
	return guard(
		request.coherenceGateClosed,
		'The amended spec has not been challenged yet.',
		'Returning to stage 1 re-closes the coherence gate. Implementing against a spec that skipped that challenge is what produced the refused lines in the first place.'
	);
}

/** An earlier report opens once the request has been through more than one iteration. */
export function canOpenPreviousReport(request: EvolutionRequest): Guarded {
	return guard(
		request.iterations.length < 2,
		'This request has only had one iteration.',
		'There is no earlier report to compare against; the current one is the first.'
	);
}

/** Every recorded verdict names the iteration that produced it. */
export function verdictsWithoutIteration(request: EvolutionRequest): number {
	return request.implementationFindings.filter((l) => !Number.isFinite(l.iteration) || l.iteration < 1)
		.length;
}
