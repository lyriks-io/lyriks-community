/**
 * One digit of a counter, drawn as a wheel: the digit it shows now and, when the last turn changed it, the digit it
 * showed before (blank for a digit the number did not have yet), and which way it turns: up as the count grows, down
 * as it shrinks. `place` counts digits from the right, so the units keep one wheel as the number widens.
 */
export interface Wheel {
	readonly place: number;
	readonly now: string;
	readonly was: string | null;
	readonly up: boolean;
}

const digitsOf = (n: number) => String(Math.max(0, Math.trunc(n)));

/**
 * The wheels of a counter that turned from `previous` to `next`, left to right. Only a digit that changed has a
 * `was` to turn from; a digit the number lost goes at once, it does not turn to blank. `still` (reduced motion)
 * gives wheels that do not turn at all.
 */
export function counterWheels(previous: number, next: number, still = false): Wheel[] {
	const before = digitsOf(previous);
	const after = digitsOf(next);
	const up = next >= previous;
	const digitAt = (digits: string, place: number) => digits[digits.length - 1 - place] ?? '';
	return Array.from({ length: after.length }, (_, i) => {
		const place = after.length - 1 - i;
		const now = digitAt(after, place);
		const was = digitAt(before, place);
		return { place, now, was: still || now === was ? null : was, up };
	});
}
