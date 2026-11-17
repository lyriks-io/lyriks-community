/**
 * What a toast shows of a long message: only the kind of error (spec:
 * foundation screenStates "Every page"). A refused save carries one line per
 * issue ("invalid_section_shape [rules]: a is…; b is…"), which grew a toast
 * taller than the screen and put its close button out of reach.
 */

/** Messages up to this length show whole. */
const MAX_LENGTH = 160;

export function toastHeadline(message: string): string {
	const text = message.trim();
	if (text.length <= MAX_LENGTH) return text;
	const colon = text.indexOf(': ');
	if (colon > 0 && colon <= MAX_LENGTH) {
		const issues = text.slice(colon + 2).split('; ').length;
		return issues > 1 ? `${text.slice(0, colon)}, ${issues} issues` : text.slice(0, colon);
	}
	return `${text.slice(0, MAX_LENGTH).trimEnd()}…`;
}
