import type { FieldValidationStatus } from '$domain/evolution';

/** An act on an answer sent but not confirmed yet (ac-evo-form-edit-optimistic). */
export type PendingVerdict =
	| { readonly act: 'validate' }
	| { readonly act: 'refuse'; readonly reason: string }
	| { readonly act: 'withdraw' }
	| { readonly act: 'postpone' }
	| { readonly act: 'resume' };

interface Trail {
	readonly validation: FieldValidationStatus;
	readonly validatedBy?: readonly string[];
	readonly refusedBy?: string;
	readonly refusalReason?: string;
	/** The people named on the answer, and how many of them validated (ac-evo-req-named-validators). */
	readonly expected?: readonly string[];
	readonly counted?: number;
	/** A person stands behind it, not only an AI client on its own (ac-evo-form-step-lock). */
	readonly humanValidated?: boolean;
	/** Whose validation their AI gave under their delegation (ac-evo-llm-delegation-marks). */
	readonly validatedByAi?: readonly string[];
}

interface Answer {
	readonly openQuestion?: boolean;
	readonly trail?: Trail;
}

/**
 * An answer read on its card as the act just sent will leave it
 * (ac-evo-form-edit-optimistic): validating puts the reader among those who
 * stand behind it, the answer validated once as many as it needs do (or every
 * person named on it), and a person stands behind it for the step lock, since
 * the reader's own click is a person's; refusing shows the refusal and its reason; taking one's
 * verdict back removes it; coming back to it later shows it postponed. With
 * nothing pending, the answer reads as the server last said.
 */
export function withPendingVerdict<A extends Answer>(answer: A, pending: PendingVerdict | null, actor: string, needed: number): A {
	if (pending === null) return answer;
	if (pending.act === 'postpone' || pending.act === 'resume') return { ...answer, openQuestion: pending.act === 'postpone' };
	const trail: Trail = answer.trail ?? { validation: 'unvalidated' };
	if (pending.act === 'refuse') return { ...answer, trail: { ...trail, validation: 'refused', refusedBy: actor, refusalReason: pending.reason } };
	const others = (trail.validatedBy ?? []).filter((id) => id !== actor);
	const by = pending.act === 'validate' ? [...others, actor] : others;
	// Someone else's refusal still stands when the reader only takes their own validation back.
	if (pending.act === 'withdraw' && trail.validation === 'refused' && trail.refusedBy !== actor) return { ...answer, trail: { ...trail, validatedBy: by } };
	const { refusedBy: _refusedBy, refusalReason: _refusalReason, ...rest } = trail;
	const expected = trail.expected ?? [];
	const counted = by.filter((id) => expected.includes(id)).length;
	const enough = by.length > 0 && (expected.length > 0 ? counted >= expected.length : by.length >= needed);
	const byAi = (trail.validatedByAi ?? []).filter((id) => id !== actor && by.includes(id));
	const human = pending.act === 'validate' || (!!trail.humanValidated && by.some((id) => !byAi.includes(id)));
	return {
		...answer,
		trail: {
			...rest,
			validatedBy: by,
			...(expected.length > 0 ? { counted } : {}),
			validation: enough ? 'validated' : 'unvalidated',
			humanValidated: human,
			validatedByAi: byAi
		}
	};
}

/**
 * A step validated as a whole along with the answers of its section (the
 * Functional and the Technical spec), read the same way: validating puts the
 * reader among those behind it, taking it back removes them.
 */
export function withPendingStep<S extends { readonly validatedBy: readonly string[]; readonly validated: boolean }>(
	step: S,
	pending: PendingVerdict | null,
	actor: string,
	needed: number
): S {
	if (pending?.act !== 'validate' && pending?.act !== 'withdraw') return step;
	const others = step.validatedBy.filter((id) => id !== actor);
	const by = pending.act === 'validate' ? [...others, actor] : others;
	return { ...step, validatedBy: by, validated: by.length >= needed };
}
