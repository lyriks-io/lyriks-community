import type { Baseline } from './draft';

/**
 * The version a team reads on its Specification 360°: v1.0 is the baseline
 * captured when the team validated the specification, and every baseline
 * captured after it (an evolution closed, a code change kept in the spec) moves
 * it one minor step. Before any validation there is no version: the
 * specification is still a draft.
 */
export interface SpecVersion {
	readonly label: string;
	/** The version before the last step, or null at v1.0. */
	readonly previous: string | null;
	/** The baseline the current version stands on. */
	readonly baselineId: string;
}

const label = (minor: number): string => `v1.${minor}`;

/** Read the version off the project's baselines, given the baseline the validation captured. */
export function specVersionOf(baselines: readonly Baseline[], validatedBaselineId: string | null): SpecVersion | null {
	if (!validatedBaselineId) return null;
	const validated = baselines.find((b) => b.id === validatedBaselineId);
	if (!validated) return null;
	const later = baselines
		.filter((b) => b.id !== validated.id && b.createdAt > validated.createdAt)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	const minor = later.length;
	const current = later.at(-1) ?? validated;
	return { label: label(minor), previous: minor > 0 ? label(minor - 1) : null, baselineId: current.id };
}
