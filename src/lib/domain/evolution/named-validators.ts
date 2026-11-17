import type { EvolutionRequest, NamedValidators } from './draft';
import { STEP_QUESTIONS } from './draft';
import { NEED_KEYS } from './blocks';

/**
 * Who is expected to validate an answer or a step (ac-evo-req-named-validators).
 *
 * By default anyone with access validates: an answer stands on as many people
 * as the request asks for, a step validated as a whole on one. Naming people
 * replaces that rule on the one answer or step they are named on: every person
 * named is expected, and only them.
 */

/** The steps validated as a whole: people are named on the step itself, never on its answers. */
export const WHOLE_VALIDATED_STEPS = ['functional_spec', 'technical_spec', 'approval'] as const;
export type WholeValidatedStep = (typeof WHOLE_VALIDATED_STEPS)[number];
export const isWholeValidatedStep = (v: unknown): v is WholeValidatedStep =>
	typeof v === 'string' && (WHOLE_VALIDATED_STEPS as readonly string[]).includes(v);

/** The steps people are named on: by answer for the Need and the Solution, as a whole for the others. */
export type NamedStep = 'need' | 'solution' | WholeValidatedStep;

/** The target the people named on a whole step are kept under. */
export const stepTarget = (step: WholeValidatedStep): string => `step:${step}`;

/** One person, however their address was typed: the roster and the validations name people by email. */
export const personKey = (id: string): string => id.trim().toLowerCase();

const SOLUTION_PREFIX = 'step.solution.';
const NEED_PREFIX = '00-need.';

/** The step a target belongs to: an answer of the Need or the Solution, or a whole step; null for anything else. */
export function stepOfTarget(target: string): NamedStep | null {
	if (target.startsWith('step:')) {
		const step = target.slice('step:'.length);
		return isWholeValidatedStep(step) ? step : null;
	}
	if (target.startsWith(NEED_PREFIX)) {
		return (NEED_KEYS as readonly string[]).includes(target.slice(NEED_PREFIX.length)) ? 'need' : null;
	}
	if (target.startsWith(SOLUTION_PREFIX)) {
		const key = target.slice(SOLUTION_PREFIX.length);
		return key === 'description' || STEP_QUESTIONS.some((q) => q.step === 'solution' && q.key === key) ? 'solution' : null;
	}
	return null;
}

type Named = { readonly namedValidators?: readonly NamedValidators[] };

/** The people expected on a target; empty when nobody is named and the default rule applies. */
export const namedOn = (request: Named, target: string): readonly string[] =>
	(request.namedValidators ?? []).find((n) => n.target === target)?.people ?? [];

/** The people named on a target who left the workspace since: no longer waited on. */
export const goneFrom = (request: Named, target: string): readonly string[] =>
	(request.namedValidators ?? []).find((n) => n.target === target)?.gone ?? [];

/** The people named who have not validated yet, among those who did (`by`). */
export const awaitedAmong = (expected: readonly string[], by: readonly string[]): string[] =>
	expected.filter((p) => !by.some((b) => personKey(b) === p));

/** The request with the people named on a target replaced; nobody named goes back to the default rule. */
export function withNamed(request: EvolutionRequest, target: string, people: readonly string[]): EvolutionRequest {
	const named = [...new Set(people.map(personKey).filter((p) => p !== ''))];
	const rest = request.namedValidators.filter((n) => n.target !== target);
	return { ...request, namedValidators: named.length > 0 ? [...rest, { target, people: named, gone: [] }] : rest };
}

/**
 * The request with the people who left the workspace moved out of the names
 * they held: they are no longer waited on, and the card still says they were
 * named. `roster` holds everyone the workspace holds now, by `personKey`; it is
 * read only when known, so a roster that failed to load never clears a name.
 */
export function withoutGoneValidators(request: EvolutionRequest, roster: ReadonlySet<string>): EvolutionRequest {
	let changed = false;
	const namedValidators = request.namedValidators.map((n) => {
		const left = n.people.filter((p) => !roster.has(p));
		if (left.length === 0) return n;
		changed = true;
		return { target: n.target, people: n.people.filter((p) => roster.has(p)), gone: [...new Set([...n.gone, ...left])] };
	});
	return changed ? { ...request, namedValidators } : request;
}

/**
 * The jobs each step calls for, by the id of the jobs a workspace starts with
 * (ac-evo-req-validator-suggestions): the people offered first when naming.
 */
export const SUGGESTED_JOBS = {
	need: ['product'],
	solution: ['product'],
	functional_spec: ['product', 'design'],
	technical_spec: ['tech', 'security'],
	approval: ['product', 'business']
} as const satisfies Record<NamedStep, readonly string[]>;

/** Whether a person holding these jobs is one the step calls for. */
export const suggestedFor = (step: NamedStep, jobIds: readonly string[]): boolean =>
	(SUGGESTED_JOBS[step] as readonly string[]).some((id) => jobIds.includes(id));
