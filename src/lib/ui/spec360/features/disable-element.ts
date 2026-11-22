import type { DisabledMarker } from '$lib/unspa-schema';

/**
 * What the page says of a disabled element and how it asks to put one aside or
 * bring it back: pure, so the words and the request are tested without a page.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "18 Nov", the day the marker was set; the instant itself when it cannot be read. */
export function disabledDay(at: string): string {
	const date = new Date(at);
	return Number.isNaN(date.getTime()) ? at : `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** The badge's sentence: who disabled the element, when and why. */
export function disabledLine(marker: DisabledMarker): string {
	const who = marker.by.trim() ? `by ${marker.by.trim()} ` : '';
	return `Disabled ${who}on ${disabledDay(marker.at)}: ${marker.reason.trim()}`;
}

/** What the element's menu offers: Disable on an element in force, Enable on a disabled one. */
export function menuChoice(marker: DisabledMarker | null | undefined): 'disable' | 'enable' {
	return marker ? 'enable' : 'disable';
}

/** The behaviour batch that disables or enables one element of a feature. */
export function disableBatch(input: {
	readonly projectId: string;
	readonly featureId: string;
	readonly elementId: string;
	readonly choice: 'disable' | 'enable';
	readonly reason?: string;
}): Record<string, unknown> {
	const op =
		input.choice === 'disable'
			? { kind: 'disable_element', elementId: input.elementId, reason: (input.reason ?? '').trim() }
			: { kind: 'enable_element', elementId: input.elementId };
	return { projectId: input.projectId, featureId: input.featureId, operations: [op] };
}

/**
 * What a refused change reads: the element was not disabled (or enabled),
 * followed by the reason the server gave (the onBlocked effects of the two actions).
 */
export function refusedLine(choice: 'disable' | 'enable', reason: string): string {
	const lead = choice === 'disable' ? 'The element was not disabled.' : 'The element was not enabled.';
	return reason.trim() ? `${lead} ${reason.trim()}` : lead;
}
