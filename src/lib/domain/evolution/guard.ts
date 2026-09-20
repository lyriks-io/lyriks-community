/**
 * Every act of the evolution lifecycle is gated by rules the specification
 * states in the reader's own words. A guard returns either "go ahead" or the
 * exact refusal the spec wrote, so the message a person sees is the one that was
 * specified rather than one invented at the UI layer.
 *
 * `reason` is what the refusal says. `detail` is the sentence explaining why the
 * rule exists, which the spec attaches to every blocking effect: it is what turns
 * a refusal into something a reader can act on.
 */
export interface Allowed {
	readonly ok: true;
}
export interface Refused {
	readonly ok: false;
	readonly reason: string;
	readonly detail: string;
}
export type Guarded = Allowed | Refused;

export const ALLOW: Allowed = { ok: true };

export const refuse = (reason: string, detail: string): Refused => ({ ok: false, reason, detail });

/** The first refusal among the checks, or `ALLOW` when every one of them passes. */
export function firstRefusal(...checks: readonly Guarded[]): Guarded {
	for (const check of checks) if (!check.ok) return check;
	return ALLOW;
}

/** `check` fails with this refusal; otherwise the act is allowed. */
export const guard = (failing: boolean, reason: string, detail: string): Guarded =>
	failing ? refuse(reason, detail) : ALLOW;
