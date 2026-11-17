import type { SpecProof } from '../ports';

/**
 * Whether an assessment still needs the exploration of the state space. The
 * solver answers every invariant, action and goal it can read; the exploration
 * keeps only what it cannot: an element it left unsettled or unsupported (a sum
 * over a list, an always-reachable goal), or no proof at all.
 */
export interface ExplorationPlan {
	readonly run: boolean;
	/** Why it runs, or why it does not: said in the assessment, never guessed. */
	readonly reasons: readonly string[];
}

const plural = (count: number, one: string, many: string): string =>
	`${count} ${count === 1 ? one : many}`;

export function explorationPlan(proof: SpecProof | null): ExplorationPlan {
	if (!proof) return { run: true, reasons: ['the solver sent no proof'] };
	if (proof.solver !== 'ran') return { run: true, reasons: ['the solver did not start'] };
	if (proof.interrupted) return { run: true, reasons: ['the solver was interrupted'] };
	// An engine without the reach search leaves actions and goals unanswered.
	if (!proof.actions) return { run: true, reasons: ['the solver did not search which actions run'] };

	const open = (outcome: string): boolean => outcome === 'unsettled' || outcome === 'unsupported';
	const statements = (proof.paths?.results ?? []).filter((row) => open(row.outcome)).length;
	const actions = proof.actions.results.filter((row) => open(row.outcome)).length;
	const goals = (proof.goals?.results ?? []).filter((row) => open(row.outcome)).length;
	// Dead ends are the exploration's to count unless the solver settled them.
	const deadEnds = !proof.deadlocks || open(proof.deadlocks.outcome);
	const reasons = [
		statements ? `${plural(statements, 'statement', 'statements')} the solver left open` : '',
		actions ? `${plural(actions, 'action', 'actions')} the solver left open` : '',
		goals ? `${plural(goals, 'goal', 'goals')} the solver left open` : '',
		deadEnds ? 'the search for dead ends left open' : ''
	].filter(Boolean);
	if (reasons.length > 0) return { run: true, reasons };

	const bound = proof.paths?.maxSteps ?? proof.actions.maxSteps;
	return {
		run: false,
		reasons: [`the solver settled every statement, action, goal and dead end within ${bound} steps`]
	};
}
