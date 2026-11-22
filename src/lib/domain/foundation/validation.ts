/**
 * Field-level validation, transcribed from the spec's parameter validations.
 * Pure functions — the UI uses them for live char counters + inline errors,
 * and use-cases reuse them to reject bad input server-side.
 */

/** Max-length caps (chars), verbatim from the spec. */
export const LIMITS = {
	productName: 80,
	/** The product summary, the project's description: read whole on the Overview (criterion 72251131). */
	brief: 500,
	briefMin: 40,
	mainProblem: 600,
	expectedOutcome: 600,
	painPoint: 48,
	criterion: 120,
	kpiName: 60,
	kpiUnit: 16,
	competitorName: 60,
	competitorNote: 80,
	differentiator: 80,
	claimedCategory: 80
} as const;

export interface FieldError {
	readonly message: string;
}

export type Validation = FieldError | null;

const tooLong = (n: number): FieldError => ({ message: `Keep it under ${n} characters.` });

/** The brief has both a floor and a ceiling. */
export function validateBrief(value: string): Validation {
	const v = value.trim();
	if (v.length === 0) return { message: 'A brief is required.' };
	if (v.length < LIMITS.briefMin)
		return { message: 'Tell us more: at least one full sentence (40+ chars).' };
	if (value.length > LIMITS.brief) return tooLong(LIMITS.brief);
	return null;
}

/**
 * Why a save of the product summary is refused, or null when it fits
 * (criterion 72251131): only a summary the save changes is held to the
 * limit, so one written longer before blocks no other save.
 */
export function summaryRefusal(next: string, before: string): string | null {
	const length = next.trim().length;
	if (next === before || length <= LIMITS.brief) return null;
	return `The product summary holds ${LIMITS.brief} characters at most; this one has ${length}. Shorten it to what the product is, for whom and why.`;
}
