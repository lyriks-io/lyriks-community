import type { ModelCheckReport, ScenarioReport, UnreachedAction } from './ports';

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

/** A bounded search and a passing scenario suite are different kinds of evidence. */
export function verificationEvidence(scenarios: ScenarioReport | null, model: ModelCheckReport | null) {
	const scenarioStatus = !scenarios ? 'unavailable' : scenarios.failed > 0 ? 'failed' : scenarios.total > 0 ? 'passed' : 'not-run';
	const explorationStatus = !model ? 'unavailable' : model.truncated === false && model.statesExplored > 0 ? 'complete' : 'bounded';
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
		/** Spec verification never executes the implementation or proves its fidelity. */
		runtimeStatus: 'not-checked' as const,
		advisories: [
			...(!scenarios || scenarios.total === 0 ? ['No authored scenarios were executed; an empty suite is not a passing test suite.'] : []),
			...(explorationStatus === 'bounded' ? [`Exploration is partial (${model?.statesExplored ?? 0} states). Unobserved actions are not proven unreachable; add targeted scenarios or adjust exploration bounds.`] : []),
			...(model?.unreachedActions?.length ? [unreachedAdvisory(model.unreachedActions)] : []),
			...(!model ? ['Model exploration is unavailable; no exhaustive verification is claimed.'] : []),
			'These checks describe the specification. Runtime, visual, timing and physical behavior require implementation tests.'
		]
	};
}

export type VerificationEvidence = ReturnType<typeof verificationEvidence>;
