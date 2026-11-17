/**
 * One hover card at a time (ac-src-code-place, ac-glos-underline-only): a
 * card that opens closes the one open before at once, instead of letting it
 * wait out its own closing delay, so two never stack when the pointer moves
 * fast from one word or place to the next. Shared by every hover card.
 */

let current: (() => void) | null = null;

/** Call when a card opens, with what closes it at once. */
export function takeTheStage(close: () => void): void {
	if (current && current !== close) current();
	current = close;
}

/** Call when a card closes. */
export function leaveTheStage(close: () => void): void {
	if (current === close) current = null;
}
