import { tick } from 'svelte';

/**
 * Marks what a block's comments show once open (FieldThread, TopicThreads and
 * the line naming its element, ItemThread): what the view brings in when the
 * reader opens them.
 */
export const COMMENTS_MARK = 'data-comments';

// The sticky headers that cover the top of the scroller: the request's, the Retrospecification's.
const STICKY_HEAD = '#evo-head, [data-sticky-head]';
// Room kept between the comments and the edge of the scroller they are brought to.
const GAP = 16;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The nearest ancestor that scrolls the element, or null when only the document does. */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}

/**
 * Where an element lays out in its scroller's content, read from the layout
 * rather than from the screen: a card that grows to open its comments is still
 * playing its move (grid-flip translates it) when this reads it, and the view
 * heads for where the comments end up. Read from the screen when the scroller
 * is not on the element's chain of offset parents.
 */
function layoutTop(el: HTMLElement, scroller: HTMLElement): number {
	let top = 0;
	for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
		if (node === scroller) return top;
		top += node.offsetTop;
	}
	return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop + scroller.scrollTop;
}

/** The control the reader clicked and where it showed in its scroller, held there while the comments are laid out. */
interface Held {
	readonly control: HTMLElement;
	readonly scroller: HTMLElement;
	readonly at: number;
}

function hold(control: HTMLElement | null): Held | null {
	const scroller = control ? scrollerOf(control) : null;
	return control && scroller ? { control, scroller, at: control.getBoundingClientRect().top - scroller.getBoundingClientRect().top } : null;
}

const clampTo = (scroller: HTMLElement, y: number) => Math.max(0, Math.min(y, scroller.scrollHeight - scroller.clientHeight));

/**
 * Keeps the control clicked under the pointer, then scrolls just enough to
 * show the comments whole, their top kept under the sticky header when they
 * are taller than the room; comments that open in view leave the page still.
 * The browser's own scroll anchoring may have moved the view meanwhile, after
 * a card that moved away (a grid laying the card clicked across its row, the
 * card above it pushed below): the view goes back before the frame is drawn.
 */
function bringIntoView(parts: readonly HTMLElement[], held: Held | null): void {
	const scroller = scrollerOf(parts[0]);
	if (!scroller) return;
	let now = scroller.scrollTop;
	if (held?.scroller === scroller && held.control.isConnected) {
		now = clampTo(scroller, layoutTop(held.control, scroller) - held.at);
		if (Math.abs(now - scroller.scrollTop) >= 2) scroller.scrollTop = now;
	}
	const tops = parts.map((el) => layoutTop(el, scroller));
	const top = Math.min(...tops);
	const bottom = Math.max(...parts.map((el, i) => tops[i] + el.offsetHeight));
	const head = scroller.querySelector<HTMLElement>(STICKY_HEAD);
	const covered = head ? Math.max(0, head.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top) : 0;
	let y = now;
	if (bottom + GAP > now + scroller.clientHeight) y = bottom + GAP - scroller.clientHeight;
	if (top - GAP - covered < y) y = top - GAP - covered;
	y = clampTo(scroller, y);
	if (Math.abs(y - now) < 2) return;
	scroller.scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Runs the reader's click on a block's comments icon and brings the comments
 * it opens into view (criterion 8cb972b5): a long block opens them at its
 * foot, below the window, where the click would seem to do nothing. `from` is
 * the icon clicked, held where it was. What `toggle` answers is awaited: a
 * card grid answers once it laid the card out across its row. A click that
 * closes the comments opens nothing new, so the view stays still.
 */
export async function toggleCommentsInView(toggle: () => unknown, from: HTMLElement | null = null): Promise<void> {
	if (typeof document === 'undefined') return void (await toggle());
	const before = new Set(document.querySelectorAll(`[${COMMENTS_MARK}]`));
	const held = hold(from);
	await toggle();
	await tick();
	const opened = [...document.querySelectorAll<HTMLElement>(`[${COMMENTS_MARK}]`)].filter((el) => !before.has(el));
	if (opened.length > 0) bringIntoView(opened, held);
}
