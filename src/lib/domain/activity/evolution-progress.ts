import { isStepValidated, readPath, skipOf, type EvolutionRequest, type StepReading, type ValidatedStep } from '$domain/evolution';

/**
 * Where an evolution stands on its six-step page (Briefing, Solution,
 * Specification, Simulation, Implementation, Verification) and the next thing
 * someone has to do on it, read off its stage and the steps people validated.
 */
export interface EvolutionNext {
	/** 1 to 6, the step of the page the request is at. */
	readonly step: number;
	readonly stepName: string;
	/** What to do there: "Write the Briefing", "Validate the Briefing". */
	readonly action: string;
	/** The step of the path behind it, whose reading says what it holds or owes; null where the page step has none. */
	readonly reading: StepReading | null;
}

/** The six steps of an evolution's page, in their order. */
export const EVOLUTION_STEPS = ['Briefing', 'Solution', 'Specification', 'Simulation', 'Implementation', 'Verification'] as const;

/** The path steps the Solution of the page carries, in the order they are written. */
const SOLUTION_STEPS: readonly ValidatedStep[] = ['solution', 'functional_spec', 'technical_spec'];

/**
 * The page's validation of the Briefing and the Solution is not mistaken for
 * their writing: nothing written asks to write, an answer still owed asks to
 * finish, and only a step written in full asks to be validated.
 */
const verbOf = (reading: StepReading | null): string =>
	reading?.progress === 'todo' ? 'Write' : reading?.progress === 'in_progress' ? 'Finish' : 'Validate';

/** An evolution still under way: neither delivered nor closed, cancelled or deleted. */
export const stillOpen = (request: Pick<EvolutionRequest, 'status' | 'stage'>): boolean => request.status === 'open' && request.stage !== 'delivered';

/** Null once nothing is left to do: delivered, closed, cancelled or deleted. */
export function evolutionNext(request: EvolutionRequest): EvolutionNext | null {
	if (!stillOpen(request)) return null;
	// Home holds no feature: what the path reads from them (questions owed, values to sign) is left out.
	const path = readPath(request, { questionsOwed: 0, pendingProposals: 0 });
	const readingOf = (step: StepReading['step']) => path.find((r) => r.step === step) ?? null;
	const at = (step: number, action: string, reading: StepReading | null): EvolutionNext => ({ step, stepName: EVOLUTION_STEPS[step - 1], action, reading });
	switch (request.stage) {
		case 'acceptance':
			return at(6, 'Read the verification and close', readingOf('approval'));
		case 'implementation':
			return at(5, 'Launch the implementation', readingOf('build'));
		case 'coherence':
			return at(4, 'Review the Simulation', readingOf('impact_analysis'));
		default: {
			if (!isStepValidated(request, 'need')) {
				const need = readingOf('need');
				return at(1, `${verbOf(need)} the Briefing`, need);
			}
			const open = SOLUTION_STEPS.find((s) => skipOf(request, s) === null && !isStepValidated(request, s));
			if (open) {
				const reading = readingOf(open);
				return at(2, `${verbOf(reading)} the Solution`, reading);
			}
			return at(3, 'Validate the Specification', null);
		}
	}
}

/** How far along its six steps an evolution is, the current one counted as begun. */
export function evolutionPercent(next: EvolutionNext | null): number {
	if (!next) return 100;
	return Math.round(((next.step - 1) / EVOLUTION_STEPS.length) * 100);
}
