/** The app's foot, under the one scroller: what a page puts there stays in view (PageFoot). */
export const APP_FOOT_ID = 'app-foot';

/**
 * Moves the element into the app's foot, where it stays in view while the page
 * scrolls, and takes it out when the page drops it: Svelte removes only what is
 * left in the page. Where the app has no foot, the element stays where it is.
 * Used as `{@attach intoAppFoot}`.
 */
export function intoAppFoot(node: HTMLElement) {
	const foot = document.getElementById(APP_FOOT_ID);
	if (!foot) return;
	foot.appendChild(node);
	return () => node.remove();
}

/** What floats at the bottom left of every page: a page's own button; the reader's AI reads in the top bar (ac-ai-session-band). */
export const FLOAT_DOCK_ID = 'app-float-left';
/** The place in that dock a page's own floating button goes. */
export const PAGE_FLOAT_ID = 'app-float-page';

/**
 * Moves a page's floating button (the decision log) to the bottom left of the
 * page, over its foot, and takes it out when the page
 * drops it. Where the app has no dock, the element stays where it is. Used as
 * `{@attach intoFloatDock}`.
 */
export function intoFloatDock(node: HTMLElement) {
	const slot = document.getElementById(PAGE_FLOAT_ID);
	if (!slot) return;
	slot.appendChild(node);
	return () => node.remove();
}
