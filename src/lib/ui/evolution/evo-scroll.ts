import { tick } from 'svelte';
import { afterValidationBeat } from './validate-motion';
import { scrollMotion } from '$ui/shell/scroll-motion';

/**
 * How the Evolution design brings a block into view: just under the sticky
 * request header, once the layout has settled (the card open before it
 * collapses above), then once more to correct any drift. When the block just
 * handled sits above the new one and the new one still starts in the upper half
 * of the screen, the view stays on the block just handled so both are seen.
 */
const HEADER_ID = 'evo-head';

function scrollerOf(el: HTMLElement): HTMLElement | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const overflow = getComputedStyle(node).overflowY;
		if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}

export function scrollToBlock(id: string, previousId: string | null = null): void {
	if (typeof window === 'undefined') return;
	const target = () => {
		const el = document.getElementById(id);
		if (!el) return null;
		const scroller = scrollerOf(el);
		// The head stuck at the top of the page: a change request's, or Knowledge's band (data-sticky-head), so a block never lands under it.
		const header = document.getElementById(HEADER_ID) ?? document.querySelector<HTMLElement>('[data-sticky-head]');
		const top = scroller ? scroller.getBoundingClientRect().top : 0;
		const offset = (header ? header.getBoundingClientRect().bottom - top : 140) + 16;
		const at = (node: HTMLElement) => node.getBoundingClientRect().top - top + (scroller ? scroller.scrollTop : window.scrollY) - offset;
		let y = at(el);
		const previous = previousId ? document.getElementById(previousId) : null;
		if (previous) {
			const py = at(previous);
			const room = (scroller ? scroller.clientHeight : window.innerHeight) - offset;
			if (py < y && y - py < room * 0.5) y = py;
		}
		return { scroller, y: Math.max(0, y) };
	};
	const go = (smooth: boolean) => {
		const t = target();
		if (!t) return;
		const current = t.scroller ? t.scroller.scrollTop : window.scrollY;
		if (Math.abs(t.y - current) <= 3) return;
		(t.scroller ?? window).scrollTo({ top: t.y, behavior: smooth ? scrollMotion() : 'auto' });
	};
	setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => go(true))), 30);
	setTimeout(() => go(false), 650);
}

/** Marks a block whose Validate still waits on the reader (ac-evo-form-validate-next). */
const WAITS_ON_READER = 'data-evo-waits';
/** The step's call to action at its foot, where the view goes once nothing of the step waits on the reader. */
export const STEP_FOOT_ID = 'evo-step-foot';
/**
 * The block to validate once one is: the first still waiting on the reader that
 * follows the one just validated in page order, so a reader validating out of
 * order keeps moving down (Knowledge criterion 7be04826, Evolution criterion
 * 27caa553); only when none follows does the view go back to the first one
 * still waiting above. Never the one just validated, nor a block inside it (a
 * section a batch just validated).
 */
export function nextToValidate(fromId: string): HTMLElement | null {
	const from = document.getElementById(fromId);
	const waiting = [...document.querySelectorAll<HTMLElement>(`[${WAITS_ON_READER}]`)].filter((el) => el !== from && el.id && !from?.contains?.(el));
	return (from && waiting.find((el) => follows(from, el))) ?? waiting[0] ?? null;
}

/** `el` comes after `from` in page order. */
// 4 is Node.DOCUMENT_POSITION_FOLLOWING, spelled out so the module reads outside a browser.
const follows = (from: Node, el: Node) => !!((from.compareDocumentPosition?.(el) ?? 0) & 4);

/** Marks the Validate button of a block, the one the design pulses once the view reaches the block. */
export const VALIDATE_CONTROL = 'data-evo-validate';
// Two beats of the design's nudge (lk-nudge, 0.9 s each), then the class goes so a later jump pulses again.
const NUDGE_CLASS = 'animate-lk-nudge';
const NUDGE_MS = 2000;
// Once the scroll has settled (scrollToBlock corrects itself at 650 ms).
const NUDGE_AFTER_MS = 700;

/** The button the reader acts on next in a block: its Validate, else the step's call to action at its foot. */
function actionIn(block: HTMLElement): HTMLElement | null {
	const validate = block.querySelector<HTMLButtonElement>(`[${VALIDATE_CONTROL}]:not(:disabled)`);
	if (validate) return validate;
	return block.id === STEP_FOOT_ID ? [...block.querySelectorAll<HTMLButtonElement>('button:not(:disabled), a')].at(-1) ?? null : null;
}

function nudge(el: HTMLElement): void {
	el.classList.remove(NUDGE_CLASS);
	void el.offsetWidth;
	el.classList.add(NUDGE_CLASS);
	window.setTimeout(() => el.classList.remove(NUDGE_CLASS), NUDGE_MS);
}

/**
 * Once the reader validated a block, brings the next one to validate just under
 * the header, or the step's call to action when none is left, and pulses the
 * button to press there (ac-evo-form-validate-next). It waits for the
 * validation to read on the page, so the block just validated no longer waits
 * and what it unfolds (a feature's actions) is drawn, and lets the validation
 * land first (validate-motion's beat).
 */
export function bringNextToValidate(fromId: string): void {
	if (typeof window === 'undefined') return;
	lastValidated = fromId;
	void tick()
		.then(afterValidationBeat)
		.then(() => {
			const id = nextToValidate(fromId)?.id ?? STEP_FOOT_ID;
			scrollToBlock(id);
			window.setTimeout(() => {
				const block = document.getElementById(id);
				const action = block ? actionIn(block) : null;
				if (action) nudge(action);
			}, NUDGE_AFTER_MS);
		});
}

/** Marks the one Validate that is the page's next action (the design's next best action). */
export const NEXT_ACTION = 'data-evo-next';

/**
 * Where the reader last validated: the next action is then read from there down, so the marker points where the
 * view went (criteria 7be04826, 27caa553).
 */
let lastValidated: string | null = null;

/** The Validate of the first block, in page order, still waiting on the reader, or null when none waits. */
export function nextActionIn(root: ParentNode): HTMLElement | null {
	const from = lastValidated && typeof document !== 'undefined' ? document.getElementById(lastValidated) : null;
	const blocks = [...root.querySelectorAll<HTMLElement>(`[${WAITS_ON_READER}]`)];
	// After a validation the blocks that follow it come first, then the ones above.
	const ordered = from ? [...blocks.filter((b) => follows(from, b)), ...blocks.filter((b) => !follows(from, b))] : blocks;
	for (const block of ordered) {
		const validate = block.querySelector<HTMLElement>(`[${VALIDATE_CONTROL}]:not(:disabled)`);
		if (validate) return validate;
	}
	return null;
}

/**
 * Keeps the next action marked while the page changes: a validation, a block
 * unfolding or a step drawn moves the mark to the new first block waiting on
 * the reader. One watcher for the whole page, so no block has to know its rank.
 */
export function watchNextToValidate(root: HTMLElement): () => void {
	let marked: HTMLElement | null = null;
	let frame = 0;
	const mark = () => {
		frame = 0;
		const next = nextActionIn(root);
		if (next === marked) return;
		if (marked) unmarkNext(marked);
		if (next) markNext(next);
		marked = next;
	};
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(mark);
	};
	const observer = new MutationObserver(schedule);
	observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [WAITS_ON_READER, 'disabled'] });
	mark();
	return () => {
		observer.disconnect();
		if (frame) cancelAnimationFrame(frame);
		if (marked) unmarkNext(marked);
	};
}

/** What the filled Validate says when pointed at, after what it validates (criterion 987dac2d). */
export const NEXT_HINT = 'Next to validate on this page';
const HINT_SEPARATOR = ' · ';

/** Fills the page's next Validate and says why in its tooltip. */
export function markNext(button: HTMLElement): void {
	button.setAttribute(NEXT_ACTION, '');
	const title = button.getAttribute('title') ?? '';
	if (!title.endsWith(NEXT_HINT)) button.setAttribute('title', title ? `${title}${HINT_SEPARATOR}${NEXT_HINT}` : NEXT_HINT);
}

/** Gives a Validate that is no longer the next one back its own tooltip. */
export function unmarkNext(button: HTMLElement): void {
	button.removeAttribute(NEXT_ACTION);
	const title = button.getAttribute('title') ?? '';
	if (!title.endsWith(NEXT_HINT)) return;
	const rest = title.slice(0, -NEXT_HINT.length);
	const own = rest.endsWith(HINT_SEPARATOR) ? rest.slice(0, -HINT_SEPARATOR.length) : rest;
	if (own) button.setAttribute('title', own);
	else button.removeAttribute('title');
}

const MARK_CLASS = 'evo-place-mark';
// Two beats of the design's glow (app.css), long enough to be found after the scroll.
const MARK_MS = 2400;

/**
 * The first of these elements, in order, that the page draws: each is waited
 * for a few frames (a step still rendering) before the next one, so the place
 * itself wins over the section around it that is already there.
 */
export async function placeOnPage(ids: readonly string[], frames = 8): Promise<HTMLElement | null> {
	if (typeof window === 'undefined') return null;
	for (const id of ids) {
		for (let frame = 0; frame <= frames; frame++) {
			const el = document.getElementById(id);
			if (el) return el;
			if (frame < frames) await new Promise((done) => requestAnimationFrame(done));
		}
	}
	return null;
}

/**
 * Brings a place just under the request header and marks it for a moment with
 * the design's violet glow (ac-evo-live-guide). The mark is dropped and laid
 * again, so a second jump to the same place shows it again.
 */
export function markPlace(el: HTMLElement): void {
	if (el.id) scrollToBlock(el.id);
	el.classList.remove(MARK_CLASS);
	void el.offsetWidth;
	el.classList.add(MARK_CLASS);
	window.setTimeout(() => el.classList.remove(MARK_CLASS), MARK_MS);
}
