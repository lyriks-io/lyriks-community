import { PanGesture, keepsPress, swallowNextClick } from './pan-gesture';

/** The element under the press, up to `root`, that scrolls on an axis with somewhere to go. */
function scrollerIn(root: HTMLElement, from: Element | null): HTMLElement | null {
	for (let el = from instanceof HTMLElement ? from : (from?.parentElement ?? null); el; el = el.parentElement) {
		const { overflowX, overflowY } = getComputedStyle(el);
		const x = /(auto|scroll)/.test(overflowX) && el.scrollWidth > el.clientWidth;
		const y = /(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight;
		if (x || y) return el;
		if (el === root) return null;
	}
	return null;
}

/**
 * Hold and drag to move around a schema drawn as a page (a journey, the
 * architecture layers) when it overflows its box: the gesture of the canvases
 * (pan-gesture.ts), scrolling the box instead of moving a drawing. A canvas
 * inside it (role="application") pans itself; the page around it never moves.
 */
export function dragToScroll(root: HTMLElement): () => void {
	const gesture = new PanGesture();
	let scroller: HTMLElement | null = null;
	let pointer = -1;

	const down = (event: PointerEvent) => {
		const target = event.target as Element | null;
		if (event.button !== 0 || keepsPress(target) || target?.closest('[role="application"]')) return;
		scroller = scrollerIn(root, target);
		if (!scroller) return;
		pointer = event.pointerId;
		gesture.press(event.clientX, event.clientY);
	};
	const move = (event: PointerEvent) => {
		if (event.pointerId !== pointer || !scroller) return;
		const step = gesture.move(event.clientX, event.clientY);
		if (!step) return;
		if (!root.hasPointerCapture(event.pointerId)) {
			root.setPointerCapture(event.pointerId);
			root.style.cursor = 'grabbing';
			root.style.userSelect = 'none';
		}
		window.getSelection()?.removeAllRanges();
		scroller.scrollLeft -= step.dx;
		scroller.scrollTop -= step.dy;
	};
	const up = (event: PointerEvent) => {
		if (event.pointerId !== pointer) return;
		if (gesture.release()) swallowNextClick(root);
		root.style.cursor = '';
		root.style.userSelect = '';
		pointer = -1;
		scroller = null;
	};

	root.addEventListener('pointerdown', down);
	root.addEventListener('pointermove', move);
	root.addEventListener('pointerup', up);
	root.addEventListener('pointercancel', up);
	return () => {
		root.removeEventListener('pointerdown', down);
		root.removeEventListener('pointermove', move);
		root.removeEventListener('pointerup', up);
		root.removeEventListener('pointercancel', up);
	};
}
