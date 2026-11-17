import type {
	ModelCheckReport,
	ScenarioReport,
	SkippedAction,
	SpecProof,
	UnreachedAction,
	VerificationVerdict
} from '../ports';

/** How many unreached actions an advisory names before it counts the rest. */
const UNREACHED_NAMED = 5;

/**
 * One sentence for the actions a truncated search did not get to. The wording
 * is deliberate: "not reached within the exploration bound" is a statement about
 * the search, where "dead" is a statement about the product.
 */
function unreachedAdvisory(unreached: readonly UnreachedAction[]): string {
	const named = unreached
		.slice(0, UNREACHED_NAMED)
		.map((action) => (action.reason ? `${action.actionName} (${action.reason})` : action.actionName));
	const rest = unreached.length - named.length;
	return (
		`${unreached.length} action(s) not reached within the exploration bound, which does not make them dead: ` +
		`${named.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}. Let a passing scenario prove each one, or raise the bounds.`
	);
}

/** One sentence for the actions the search never ran, so a skipped action never reads as checked. */
function skippedAdvisory(skipped: readonly SkippedAction[]): string {
	const named = skipped
		.slice(0, UNREACHED_NAMED)
		.map((action) => (action.reason ? `${action.actionName} (${action.reason})` : action.actionName));
	const rest = skipped.length - named.length;
	return (
		`${skipped.length} action(s) never run by the exploration, so nothing was checked behind them: ` +
		`${named.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}. Give each input a min and max, a default, or a scenario.`
	);
}

/**
 * A bounded search and a passing scenario suite are different kinds of evidence.
 * When the exploration was not run because the solver settled everything,
 * `solverProof` is the evidence: its paths from the start and its reach search,
 * both bounded by the steps it searched.
 */
export interface VerificationEvidence {
	readonly scenarioStatus: 'unavailable' | 'failed' | 'passed' | 'not-run';
	/** `solver`: the exploration was not needed, the solver's bounded search is the evidence. */
	readonly explorationStatus: 'unavailable' | 'complete' | 'bounded' | 'solver';
	readonly statesExplored: number;
	readonly conclusion:
		| 'not-checked'
		| 'counterexample-found'
		| 'no-counterexample-in-explored-model'
		| 'no-counterexample-within-bounds';
	readonly unobservedActions: readonly string[];
	readonly unreachedActions?: readonly UnreachedAction[];
	readonly skippedActions?: readonly SkippedAction[];
	/** Spec verification never executes the implementation or proves its fidelity. */
	readonly runtimeStatus: 'not-checked';
	readonly advisories: readonly string[];
}

const RUNTIME_ADVISORY =
	'These checks describe the specification. Runtime, visual, timing and physical behavior require implementation tests.';

const scenarioStatusOf = (scenarios: ScenarioReport | null): VerificationEvidence['scenarioStatus'] =>
	!scenarios ? 'unavailable' : scenarios.failed > 0 ? 'failed' : scenarios.total > 0 ? 'passed' : 'not-run';

const emptySuiteAdvisory = (scenarios: ScenarioReport | null): string[] =>
	!scenarios || scenarios.total === 0
		? ['No authored scenarios were executed; an empty suite is not a passing test suite.']
		: [];

/** The solver's bounded search as the evidence, when the exploration was not needed. */
function solverEvidence(scenarios: ScenarioReport | null, proof: SpecProof): VerificationEvidence {
	const broken = (proof.paths?.results ?? []).filter((row) => row.outcome === 'violated').length;
	const bound = proof.paths?.maxSteps ?? proof.actions?.maxSteps ?? 0;
	return {
		scenarioStatus: scenarioStatusOf(scenarios),
		explorationStatus: 'solver',
		statesExplored: 0,
		conclusion: broken > 0 ? 'counterexample-found' : 'no-counterexample-within-bounds',
		unobservedActions: (proof.actions?.results ?? [])
			.filter((row) => row.outcome === 'none-within-bound')
			.map((row) => row.actionName),
		runtimeStatus: 'not-checked',
		advisories: [
			...emptySuiteAdvisory(scenarios),
			`The solver settled every statement, action, goal and dead end within ${bound} steps from the start, so the exploration was not run; nothing is proven beyond those steps.`,
			RUNTIME_ADVISORY
		]
	};
}

export function verificationEvidence(
	scenarios: ScenarioReport | null,
	model: ModelCheckReport | null,
	solverProof: SpecProof | null = null
): VerificationEvidence {
	if (!model && solverProof) return solverEvidence(scenarios, solverProof);
	const scenarioStatus = scenarioStatusOf(scenarios);
	const skipped = model?.skippedActions ?? [];
	const explorationStatus: VerificationEvidence['explorationStatus'] = !model
		? 'unavailable'
		: model.truncated === false && model.statesExplored > 0 && skipped.length === 0
			? 'complete'
			: 'bounded';
	const violations = model?.invariantViolations?.length ?? 0;
	return {
		scenarioStatus,
		explorationStatus,
		statesExplored: model?.statesExplored ?? 0,
		conclusion: !model ? 'not-checked' : violations > 0 ? 'counterexample-found' : explorationStatus === 'complete' ? 'no-counterexample-in-explored-model' : 'no-counterexample-within-bounds',
		unobservedActions: model?.deadActions ?? [],
		// Kept apart from `unobservedActions`, and absent when the engine does not
		// tell the two apart: an empty list would claim a distinction nobody made.
		...(model?.unreachedActions ? { unreachedActions: model.unreachedActions } : {}),
		...(model?.skippedActions ? { skippedActions: model.skippedActions } : {}),
		runtimeStatus: 'not-checked',
		advisories: [
			...emptySuiteAdvisory(scenarios),
			...(explorationStatus === 'bounded' ? [`Exploration is partial (${model?.statesExplored ?? 0} states). Unobserved actions are not proven unreachable; add targeted scenarios or adjust exploration bounds.`] : []),
			...(model?.unreachedActions?.length ? [unreachedAdvisory(model.unreachedActions)] : []),
			...(skipped.length > 0 ? [skippedAdvisory(skipped)] : []),
			...(!model ? ['Model exploration is unavailable; no exhaustive verification is claimed.'] : []),
			RUNTIME_ADVISORY
		]
	};
}

/**
 * The verdict of one reading, with what its exploration and the solver's path
 * search found counted in. A statement broken by both is counted once.
 *
 * The engine's verification runs without exploring the state space, so its
 * verdict could read passed while the model check of the same reading held a
 * counterexample: one answer saying two opposite things. Every invariant the
 * exploration broke (a feature's own or one of its project's) now fails the
 * verdict and is counted among its violations. A verdict that already failed,
 * or an exploration that found nothing, is returned as it came.
 */
export function verdictWithExploration(
	verdict: VerificationVerdict | null,
	modelCheck: ModelCheckReport | null,
	proof: SpecProof | null = null
): VerificationVerdict | null {
	const provenRows = (proof?.paths?.results ?? []).filter((row) => row.outcome === 'violated');
	// An engine whose verify proved the features already counts the solver's
	// paths: only what the exploration found beyond them is added.
	const counted = new Set(verdict?.solverCounted ? provenRows.map((row) => row.invariantName) : []);
	const explored = (modelCheck?.invariantViolations ?? []).filter(
		(violation) => !counted.has(violation.invariantName)
	);
	const seen = new Set(explored.map((violation) => violation.invariantName));
	// A path the solver found from the start, replayed by the simulator, is a
	// counterexample like any the exploration found.
	const proven = verdict?.solverCounted
		? []
		: provenRows.filter((row) => !seen.has(row.invariantName));
	const found = explored.length + proven.length;
	if (!verdict || found === 0) return verdict;
	const features = verdict.features.map((feature) => ({ ...feature, passed: false }));
	return {
		...verdict,
		passed: false,
		invariantViolations: verdict.invariantViolations + found,
		features,
		featuresPassed: 0,
		featuresFailed: features.length
	};
}

