/**
 * The wheel over a drawing (ac-diag-wheel). In a page it never takes the
 * page's scroll: it zooms only with Ctrl (⌘ on a Mac) held or by a trackpad
 * pinch, which browsers send as a wheel with Ctrl, and Safari as gesture
 * events; a plain wheel scrolls the page and asks for the hint. Enlarged, the
 * drawing has the room to itself and the wheel zooms it directly. However
 * finely the wheel turns, the zoom follows it in proportion.
 */

// A wheel's lines and pages, in pixels, as browsers count them.
const LINE_PX = 16;
const PAGE_PX = 800;
// One notch of a mouse wheel zooms by about 15 %; a trackpad's small steps by as little.
const ZOOM_PER_PX = 0.0025;
const MAX_STEP_PX = 60;

/** The zoom one wheel event asks for: in proportion to how far it turned, a notch at most. */
export function wheelFactor(event: { readonly deltaY: number; readonly deltaMode: number }): number {
	const px = event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaMode === 2 ? event.deltaY * PAGE_PX : event.deltaY;
	return Math.exp(-Math.max(-MAX_STEP_PX, Math.min(MAX_STEP_PX, px)) * ZOOM_PER_PX);
}

/** Whether this wheel zooms the drawing: always when it has the room to itself, otherwise with Ctrl or ⌘ (a pinch included). */
export const wheelZooms = (event: { readonly ctrlKey: boolean; readonly metaKey: boolean }, ownsRoom: boolean): boolean =>
	ownsRoom || event.ctrlKey || event.metaKey;

/** The key that zooms with the wheel, as the reader's keyboard names it. */
export function zoomKeyLabel(): string {
	if (typeof navigator === 'undefined') return 'Ctrl';
	const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
	return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}

export interface WheelZoomOptions {
	/** The drawing has the room to itself (enlarged): the wheel zooms without a key. */
	readonly ownsRoom: () => boolean;
	/** Zoom by `factor` around (cx, cy), in the element's own pixels. */
	readonly zoomAt: (factor: number, cx: number, cy: number) => void;
	/** A plain wheel scrolled the page over the drawing: say how it zooms. */
	readonly hint?: () => void;
}

type SafariGesture = Event & { scale: number; clientX: number; clientY: number };

/** Listens for the wheel and Safari's pinch on `el`; returns the cleanup. */
export function listenWheelZoom(el: HTMLElement, options: WheelZoomOptions): () => void {
	const local = (x: number, y: number) => {
		const r = el.getBoundingClientRect();
		return { x: x - r.left, y: y - r.top };
	};
	const onWheel = (event: WheelEvent) => {
		if (!wheelZooms(event, options.ownsRoom())) return options.hint?.();
		event.preventDefault();
		const at = local(event.clientX, event.clientY);
		options.zoomAt(wheelFactor(event), at.x, at.y);
	};
	// Safari pinches with gesture events, scale counted from the gesture's start.
	let pinched = 1;
	const onGestureStart = (event: Event) => {
		event.preventDefault();
		pinched = 1;
	};
	const onGestureChange = (event: Event) => {
		const gesture = event as SafariGesture;
		event.preventDefault();
		const at = local(gesture.clientX, gesture.clientY);
		options.zoomAt(gesture.scale / pinched, at.x, at.y);
		pinched = gesture.scale;
	};
	el.addEventListener('wheel', onWheel, { passive: false });
	el.addEventListener('gesturestart', onGestureStart);
	el.addEventListener('gesturechange', onGestureChange);
	return () => {
		el.removeEventListener('wheel', onWheel);
		el.removeEventListener('gesturestart', onGestureStart);
		el.removeEventListener('gesturechange', onGestureChange);
	};
}
