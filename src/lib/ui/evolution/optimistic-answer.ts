import type { FieldValidationStatus } from '$domain/evolution';

interface Trail {
	readonly validation: FieldValidationStatus;
	readonly validatedBy?: readonly string[];
	readonly refusedBy?: string;
	readonly refusalReason?: string;
	readonly outdatedBy?: string;
}

interface Answer {
	readonly value: string;
	/** Left out on a text that only says what it holds (a step's description): it is read from the value. */
	readonly filled?: boolean;
	readonly trail?: Trail;
}

/**
 * An answer saved but not confirmed yet, read on its card as the server is
 * about to write it (ac-evo-form-edit-optimistic): the new text, written and
 * waiting for a validation, a validation given before outdated, a refusal
 * gone. With nothing pending, the answer reads as it was saved.
 */
export function withPendingAnswer<A extends Answer>(answer: A, pending: string | null): A {
	if (pending === null || pending === answer.value) return answer;
	const trail = answer.trail;
	if (!trail) return { ...answer, value: pending, filled: pending.trim() !== '' };
	const { validatedBy, refusedBy: _refusedBy, refusalReason: _refusalReason, outdatedBy, ...rest } = trail;
	const outdatedFrom = validatedBy?.[0] ?? outdatedBy;
	return {
		...answer,
		value: pending,
		filled: pending.trim() !== '',
		trail: { ...rest, validation: outdatedFrom ? 'outdated' : 'unvalidated', ...(outdatedFrom ? { outdatedBy: outdatedFrom } : {}) }
	};
}
