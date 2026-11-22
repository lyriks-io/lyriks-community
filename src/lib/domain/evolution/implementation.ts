import type { Actor, EvolutionRequest, ImplementationFinding } from './draft';
import type { DerivationSource, ImplementationVerdict } from './enums';
import { firstRefusal, guard, type Guarded } from './guard';
import { isDataChangeRequirement } from './report-requirement';

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
 *   located, non-conform when something was located that nothing proves: its
 *   signature no longer matches, or no passing result stands behind it. The
 *   line's code statement says which (ac-evo-impl-unproven).
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

/** A line this request answers for: everything but what the touched features already held. */
export const isRequestLine = (line: ImplementationFinding): boolean => line.scope !== 'inherited';

/**
 * How many lines of the current iteration still carry no decision and hold
 * the report open. Inherited lines are the touched features' own standing:
 * they are shown, and decidable, but a change is not held hostage to the
 * backlog of the feature it amends.
 */
export function undecidedCount(request: EvolutionRequest): number {
	return currentLines(request).filter(holdsReportOpen).length;
}

/**
 * A line a person still owes a decision on. A conform line is proved by a
 * passing result on a located span: it is shown, and a person may still send
 * it back, but nobody is asked to sign what the code already proves.
 */
export function holdsReportOpen(line: ImplementationFinding): boolean {
	return isRequestLine(line) && line.decision === 'undecided' && line.verdict !== 'conform';
}

/**
 * Lines the request brought that only wait on the code: still to build, with
 * nothing for a person to decide yet. The board reads them as waiting on the
 * code, not on someone (ac-evo-board-overview).
 */
export function toBuildCount(request: EvolutionRequest): number {
	return currentLines(request).filter((l) => holdsReportOpen(l) && l.verdict === 'missing').length;
}

/**
 * A line of the request that waits for the code or a passing test, not for a
 * person: not built yet, or found and not proven yet (stale, moved, failing).
 * It closes at the next index sync after the code or its test moved (feat-25
 * f27ab2f8, 127dba2b); a person may still rule it, nobody has to. A table
 * change the code cannot locate is a person's to confirm.
 */
export function waitsOnCode(line: ImplementationFinding): boolean {
	return holdsReportOpen(line) && (line.verdict === 'non_conform' || (line.verdict === 'missing' && !isDataChangeRequirement(line.requirement)));
}

/** The lines of the request that close on the code or a test, at the next index sync (criterion 4913a449). */
export function awaitingCodeCount(request: EvolutionRequest): number {
	return currentLines(request).filter(waitsOnCode).length;
}

/** The lines of the request only a person settles: an addition out of scope, a regression, a table change to confirm (criterion 4913a449). */
export function awaitingPersonCount(request: EvolutionRequest): number {
	return currentLines(request).filter((l) => holdsReportOpen(l) && !waitsOnCode(l)).length;
}

/** Inherited lines still undecided: context, never a gate. */
export function inheritedUndecidedCount(request: EvolutionRequest): number {
	return currentLines(request).filter((l) => !isRequestLine(l) && l.decision === 'undecided').length;
}

/** The report lines of the iteration in flight. Past iterations keep their own. */
export function currentLines(request: Pick<EvolutionRequest, 'implementationFindings' | 'iteration'>): ImplementationFinding[] {
	return request.implementationFindings.filter((l) => l.iteration === request.iteration);
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
			currentLines(request).some((l) => isRequestLine(l) && l.decision === 'invalidated'),
			'Lines were sent back to the build. Rebuild the report once the code changed.',
			'A line sent back is work announced, not work done: the report closes on what the code does now.'
		),
		guard(
			rechallengePending(request),
			'An adoption amended the spec. Run the readings of the Impact analysis again, coherence and docking, before closing this report.',
			'A report that changed the spec is not settled until the changed spec was read against the product again.'
		)
	);
}

/** The conform lines a rebrief must name as untouchable. */
export function protectedLineIds(request: EvolutionRequest): string[] {
	return currentLines(request)
		.filter((l) => l.verdict === 'conform')
		.map((l) => l.id);
}

const VERDICT_WORDS: readonly [ImplementationVerdict, string][] = [
	['conform', 'conform'],
	['missing', 'to build'],
	['non_conform', 'found, not tested yet'],
	['out_of_scope', 'out of scope'],
	['regression', 'regression']
];

/**
 * What a built report says in one sentence (criterion:46dc1372): the request's
 * own lines first, conform and to build always said, the other verdicts when it
 * holds some; then the inherited lines, the backlog of the features touched,
 * which never hold the gate. Counted on the lines the report keeps, so the two
 * add up to what part "report" lists.
 */
export function reportSummary(specVersion: number, lines: readonly ImplementationFinding[]): string {
	const own = lines.filter(isRequestLine);
	const inherited = lines.filter((l) => !isRequestLine(l));
	const count = (of: readonly ImplementationFinding[], verdict: ImplementationVerdict) => of.filter((l) => l.verdict === verdict).length;
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const ownCounts = VERDICT_WORDS.filter(([v]) => v === 'conform' || v === 'missing' || count(own, v) > 0).map(([v, word]) => `${count(own, v)} ${word}`);
	const inheritedCounts = VERDICT_WORDS.filter(([v]) => count(inherited, v) > 0).map(([v, word]) => `${count(inherited, v)} ${word}`);
	const head = `Report for version ${specVersion}: ${plural(own.length, 'line')} of this request: ${ownCounts.join(', ')}.`;
	return inherited.length === 0
		? head
		: `${head} ${plural(inherited.length, 'inherited line')}, the backlog of the features touched, never hold the gate: ${inheritedCounts.join(', ')}.`;
}
