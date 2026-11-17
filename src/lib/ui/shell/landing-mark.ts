import { scrollerOf } from './comments-in-view';
import { scrollMotion } from './scroll-motion';

/**
 * Where a link to a conversation lands (criterion 0bdc1d4f): the message it
 * names, or the conversation, scrolled to the middle of the view and marked
 * long enough to be found after the scroll. The mark's look (`.lk-landed`)
 * lives in `src/app.css`: its fade runs a little past LANDING_MS so the class
 * leaves on a faded mark, and under reduced motion it holds still until then.
 */
export const LANDING_MS = 3000;
export const LANDING_CLASS = 'lk-landed';
// The sticky heads that cover the top of the scroller: a Specification 360° page's, the request's, the Retrospecification's.
const STICKY_HEAD = '[data-page-head], #evo-head, [data-sticky-head]';
// Room kept under the head above an element taller than the view, whose top is shown rather than its middle.
const GAP = 16;

/**
 * Scroll the element's own scroller to put it in the middle of what shows under the sticky head. A smooth
 * scrollIntoView is dropped by Chromium as soon as anything else asks one, so the scroller is scrolled itself.
 */
function bringToMiddle(el: HTMLElement): void {
	const scroller = scrollerOf(el) ?? (document.scrollingElement as HTMLElement | null);
	if (!scroller) return;
	const box = el.getBoundingClientRect();
	const whole = scroller === document.scrollingElement;
	const viewTop = whole ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
	const viewHeight = whole ? window.innerHeight : scroller.clientHeight;
	const head = scroller.querySelector<HTMLElement>(STICKY_HEAD);
	const covered = head ? Math.min(viewHeight, Math.max(0, head.getBoundingClientRect().bottom - viewTop)) : 0;
	const room = viewHeight - covered;
	const offset = covered + (box.height + 2 * GAP > room ? GAP : (room - box.height) / 2);
	const top = scroller.scrollTop + box.top - viewTop - offset;
	scroller.scrollTo({ top: Math.max(0, top), behavior: scrollMotion() });
}

/** Scroll the element to the middle of the view and mark it for LANDING_MS; a second landing lays the mark again. */
export function landOn(el: HTMLElement | null | undefined): void {
	if (!el) return;
	bringToMiddle(el);
	el.classList.remove(LANDING_CLASS);
	void el.offsetWidth;
	el.classList.add(LANDING_CLASS);
	window.setTimeout(() => el.classList.remove(LANDING_CLASS), LANDING_MS);
}
