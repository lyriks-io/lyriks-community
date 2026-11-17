/**
 * Puts a page back where the reader left it when they return to it through an
 * in-app "Back" (a citation's register, then its back arrow).
 *
 * Project pages scroll inside their own panel, not the window, so the browser's
 * and SvelteKit's scroll restoration never see it. What is remembered is the
 * position of the panel that scrolled, found again on return by its rank among
 * the page's scroll panels, keyed by the path being returned to. One slot in
 * session storage: only the latest way back matters.
 */

const KEY = 'lyriks:return-scroll';
const PANELS = '.overflow-y-auto, .overflow-auto, .overflow-y-scroll';
/** How long the returning page may take to render enough to scroll that far. */
const SETTLE_MS = 3000;

interface Saved {
	path: string;
	panel: number;
	top: number;
	windowTop: number;
}

const panels = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(PANELS));

/** The nearest panel above `from` that actually scrolls. */
function scrollerOf(from: Element | null): HTMLElement | null {
	for (let el = from?.parentElement ?? null; el; el = el.parentElement) {
		const { overflowY } = getComputedStyle(el);
		if (/(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight) return el;
	}
	return null;
}

/** Remember how `path` is scrolled now, around the element the reader acted on. */
export function rememberScroll(path: string, anchor: Element | null): void {
	const scroller = scrollerOf(anchor);
	const saved: Saved = {
		path,
		panel: scroller ? panels().indexOf(scroller) : -1,
		top: scroller?.scrollTop ?? 0,
		windowTop: window.scrollY
	};
	try {
		sessionStorage.setItem(KEY, JSON.stringify(saved));
	} catch {
		// Storage blocked (private mode): returning simply lands at the top.
	}
}

/**
 * Scroll `path` back to what was remembered for it. The page renders in steps
 * (data, then tabs, then cards), so it retries each frame until the panel is
 * tall enough or SETTLE_MS has passed.
 */
export function restoreScroll(path: string): void {
	let saved: Saved | null = null;
	try {
		saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null;
		sessionStorage.removeItem(KEY);
	} catch {
		return;
	}
	if (!saved || saved.path !== path) return;
	const { panel, top, windowTop } = saved;
	const until = performance.now() + SETTLE_MS;
	const attempt = () => {
		window.scrollTo(0, windowTop);
		const el = panel >= 0 ? panels()[panel] : null;
		if (el) el.scrollTop = top;
		const done = (!el || Math.abs(el.scrollTop - top) < 2) && Math.abs(window.scrollY - windowTop) < 2;
		if (!done && performance.now() < until) requestAnimationFrame(attempt);
	};
	requestAnimationFrame(attempt);
}
