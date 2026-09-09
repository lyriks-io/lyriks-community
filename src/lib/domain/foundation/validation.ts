/**
 * Field-level validation, transcribed from the spec's parameter validations.
 * Pure functions — the UI uses them for live char counters + inline errors,
 * and use-cases reuse them to reject bad input server-side.
 */

/** Max-length caps (chars), verbatim from the spec. */
export const LIMITS = {
	productName: 80,
	brief: 2000,
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

/** Required + max length. */
export function validateText(value: string, max: number, label = 'This field'): Validation {
	const v = value.trim();
	if (v.length === 0) return { message: `${label} is required.` };
	if (value.length > max) return tooLong(max);
	return null;
}

/** Optional text that still has a ceiling (e.g. a single criterion). */
export function validateOptionalText(value: string, max: number): Validation {
	if (value.length > max) return tooLong(max);
	return null;
}

/** The brief has both a floor and a ceiling. */
export function validateBrief(value: string): Validation {
	const v = value.trim();
	if (v.length === 0) return { message: 'A brief is required.' };
	if (v.length < LIMITS.briefMin)
		return { message: 'Tell us more: at least one full sentence (40+ chars).' };
	if (value.length > LIMITS.brief) return tooLong(LIMITS.brief);
	return null;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
