import type { ScenarioView } from '$application/spec360/features';

/**
 * The closed line of an action's scenarios, in words: how many there are and
 * how many the code proves, what fails and what nothing proves yet said in the
 * same line so it shows without opening it. A disabled scenario leaves the count.
 */

export interface ScenarioTally {
	readonly total: number;
	readonly proven: number;
	readonly failing: number;
	readonly unproven: number;
}

export function scenarioTally(scenarios: readonly ScenarioView[]): ScenarioTally {
	const inForce = scenarios.filter((s) => !s.disabled);
	const count = (proof: ScenarioView['proof']) => inForce.filter((s) => s.proof === proof).length;
	return { total: inForce.length, proven: count('proven'), failing: count('failing'), unproven: count('unproven') };
}

export function scenarioLine(tally: ScenarioTally): string {
	if (tally.total === 0) return 'No scenario yet';
	return [
		`${tally.total} ${tally.total === 1 ? 'scenario' : 'scenarios'}`,
		`${tally.proven} proven against the code`,
		...(tally.failing > 0 ? [`${tally.failing} failing`] : []),
		...(tally.unproven > 0 ? [`${tally.unproven} not proven yet`] : [])
	].join(' · ');
}

/** How a scenario's proof reads beside it. */
export function proofLabel(proof: ScenarioView['proof']): string {
	return proof === 'proven' ? 'Proven against the code' : proof === 'failing' ? 'Failing' : 'Not proven yet';
}
