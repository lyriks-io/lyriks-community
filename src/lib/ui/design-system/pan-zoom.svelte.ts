// Zoom and pan a diagram (feat-fb747-diagram-fullscreen): zoom by steps between
// 20% and 400%, the wheel around the pointer (with Ctrl or a pinch in a page),
// drag or pinch to move, throw it on, fit the whole diagram.

import { CanvasCamera } from './canvas-camera';
import { CanvasGesture } from './canvas-gesture';
import { keepsPress, swallowNextClick } from './pan-gesture';
import { listenWheelZoom } from './wheel-zoom';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.2;
const PADDING = 16;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export type ZoomOutcome = { status: 'success'; zoom: number } | { status: 'blocked'; reason: string };

/** zoomIn: one step larger, never past the largest zoom. */
export function zoomIn(zoom: number): ZoomOutcome {
	if (zoom >= MAX_ZOOM) return { status: 'blocked', reason: 'The diagram is at its largest zoom.' };
	return { status: 'success', zoom: Math.min(MAX_ZOOM, zoom * ZOOM_STEP) };
}

/** zoomOut: one step smaller, never below the smallest zoom. */
export function zoomOut(zoom: number): ZoomOutcome {
	if (zoom <= MIN_ZOOM) return { status: 'blocked', reason: 'The diagram is at its smallest zoom.' };
	return { status: 'success', zoom: Math.max(MIN_ZOOM, zoom / ZOOM_STEP) };
}

/** fitToView: the whole diagram centred in view, scaled down to fit (never up). */
export function fitToView(view: { w: number; h: number }, natural: { w: number; h: number }, maxFit = 1): { scale: number; tx: number; ty: number } {
	const scale = clampZoom(Math.min(maxFit, (view.w - PADDING * 2) / natural.w, (view.h - PADDING * 2) / natural.h));
	return { scale, tx: (view.w - natural.w * scale) / 2, ty: (view.h - natural.h * scale) / 2 };
}

/** Contain every edge of an Evolution drawing, even when its full fit is below manual zoom. */
export function fitEntireView(view: { w: number; h: number }, natural: { w: number; h: number }, maxFit = 1): { scale: number; tx: number; ty: number } {
	const scale = Math.max(Number.MIN_VALUE, Math.min(MAX_ZOOM, maxFit, (view.w - PADDING * 2) / natural.w, (view.h - PADDING * 2) / natural.h));
	return { scale, tx: (view.w - natural.w * scale) / 2, ty: (view.h - natural.h * scale) / 2 };
}

/**
 * fitToRead: a diagram whose words must read (ac-evo-uml-legible) fits the
 * view's width, never under `readable` nor over `maxFit`; centred when it is
 * smaller than the view, from its top-left corner when larger, so its start
 * shows and the rest is moved into view rather than shrunk.
 */
export function fitToRead(view: { w: number; h: number }, natural: { w: number; h: number }, readable: number, maxFit = 1): { scale: number; tx: number; ty: number } {
	const scale = clampZoom(Math.max(readable, Math.min(maxFit, (view.w - PADDING * 2) / natural.w)));
	const w = natural.w * scale;
	const h = natural.h * scale;
	return { scale, tx: w <= view.w - PADDING * 2 ? (view.w - w) / 2 : PADDING, ty: h <= view.h - PADDING * 2 ? (view.h - h) / 2 : PADDING };
}

/** centreOn: the diagram point (x, y) in the middle of the view, at `zoom`. */
export function centreOn(view: { w: number; h: number }, point: { x: number; y: number }, zoom: number): { scale: number; tx: number; ty: number } {
	const scale = clampZoom(zoom);
	return { scale, tx: view.w / 2 - point.x * scale, ty: view.h / 2 - point.y * scale };
}

/** How the wheel reaches a diagram: whether it has the room to itself (enlarged), and the hint a plain wheel asks for. */
export interface PanZoomWheel {
	readonly ownsRoom: () => boolean;
	readonly hint?: () => void;
}

/** The view on one diagram: its zoom and where it sits, bound to the viewport that shows it. */
export class PanZoom {
	scale = $state(1);
	tx = $state(0);
	ty = $state(0);
	/** The whole diagram is in view; it stays so when the viewport changes size. */
	fitted = $state(true);
	natural = $state({ w: 0, h: 0 });
	/** The width of the viewport showing it, followed as it changes. */
	viewWidth = $state(0);
	dragging = $state(false);
	#viewport: HTMLElement | null = null;
	#gesture = new CanvasGesture();
	/** Moves the view as a hand expects: glides, throws, edges (ac-diag-throw, ac-diag-glide). */
	#camera: CanvasCamera;
	/** How far fitting may enlarge a diagram drawn smaller than its view; 1 never enlarges it. */
	readonly #maxFit: number;
	/** Set for a diagram whose words must read: fitting keeps at least this zoom and fits the width only (fitToRead). */
	readonly readable: number | null;
	readonly #fitEntire: boolean;

	constructor(options: { readonly maxFit?: number; readonly readable?: number; readonly fitEntire?: boolean } = {}) {
		this.#maxFit = options.maxFit ?? 1;
		this.readable = options.readable ?? null;
		this.#fitEntire = options.fitEntire ?? false;
		this.#camera = new CanvasCamera({
			read: () => ({ s: this.scale, x: this.tx, y: this.ty }),
			write: (v) => {
				this.scale = v.s;
				this.tx = v.x;
				this.ty = v.y;
			},
			min: options.fitEntire ? 0 : MIN_ZOOM,
			max: MAX_ZOOM,
			bounds: () => {
				const el = this.#viewport;
				if (!el || !this.natural.w || !this.natural.h) return null;
				return { view: { w: el.clientWidth, h: el.clientHeight }, content: { x: 0, y: 0, w: this.natural.w, h: this.natural.h } };
			}
		});
	}

	/** The height the drawing takes once fitted to `width`, its margins included: a frame that grows with it holds it whole. */
	readingHeight(width: number): number {
		if (!this.natural.w || !this.natural.h || this.readable === null) return 0;
		return this.natural.h * fitToRead({ w: width, h: Infinity }, this.natural, this.readable, this.#maxFit).scale + PADDING * 2;
	}

	get atMax(): boolean {
		return this.scale >= MAX_ZOOM;
	}
	get atMin(): boolean {
		return this.scale <= MIN_ZOOM;
	}

	/** The wheel (ac-diag-wheel) and refit on resize; returns the cleanup. */
	attach(viewport: HTMLElement, wheel: PanZoomWheel = { ownsRoom: () => false }): () => void {
		this.#viewport = viewport;
		const unlisten = listenWheelZoom(viewport, { ...wheel, zoomAt: (factor, cx, cy) => this.zoomAt(factor, cx, cy) });
		this.viewWidth = viewport.clientWidth;
		const resized = new ResizeObserver(() => {
			this.viewWidth = viewport.clientWidth;
			if (this.fitted) this.fit();
		});
		resized.observe(viewport);
		return () => {
			unlisten();
			resized.disconnect();
			this.#camera.stop();
			this.#gesture.cancel();
			this.#viewport = null;
		};
	}

	/** The diagram's natural size changed (a new rendering, a node unfolded): refit only a fitted view. */
	setNatural(w: number, h: number): void {
		if (w === this.natural.w && h === this.natural.h) return;
		this.natural = { w, h };
		if (this.fitted) this.fit();
	}

	/** Show the whole diagram again at its next rendering (a new view of it). */
	refit(): void {
		this.fitted = true;
		this.fit();
	}

	#placed(): { scale: number; tx: number; ty: number } | null {
		const el = this.#viewport;
		if (!el || !this.natural.w || !this.natural.h) return null;
		const view = { w: el.clientWidth, h: el.clientHeight };
		return this.#fitEntire ? fitEntireView(view, this.natural, this.#maxFit) : this.readable === null ? fitToView(view, this.natural, this.#maxFit) : fitToRead(view, this.natural, this.readable, this.#maxFit);
	}

	/** Fit at once: the layout changed under the diagram (a resize, a new rendering). */
	fit(): void {
		const placed = this.#placed();
		if (!placed) return;
		this.#camera.jump({ s: placed.scale, x: placed.tx, y: placed.ty });
		this.fitted = true;
	}

	/** Fit because the reader asked (the zoom shown, a double-click, the 0 key): the diagram glides there. */
	showAll(): void {
		const placed = this.#placed();
		if (!placed) return;
		this.#camera.glideTo({ s: placed.scale, x: placed.tx, y: placed.ty });
		this.fitted = true;
	}

	/** Bring the diagram point (x, y) to the middle of the view, never smaller than full size: an element pointed at reads. */
	focus(x: number, y: number): void {
		const el = this.#viewport;
		if (!el) return;
		const placed = centreOn({ w: el.clientWidth, h: el.clientHeight }, { x, y }, Math.max(this.#camera.target.s, 1));
		this.#camera.glideTo({ s: placed.scale, x: placed.tx, y: placed.ty });
		this.fitted = false;
	}

	/** Zoom keeping the point under (cx, cy), in viewport coordinates, anchored. */
	zoomAt(factor: number, cx: number, cy: number): void {
		const from = this.#camera.target.s;
		if (from < MIN_ZOOM && factor <= 1) return;
		this.#camera.zoomAt(clampZoom(from * factor) / from, cx, cy);
		this.fitted = false;
	}

	// A step counts from where the glide is going, so two quick clicks zoom two steps.
	#zoomByStep(outcome: ZoomOutcome): void {
		const el = this.#viewport;
		if (outcome.status === 'blocked' || !el) return;
		const from = this.#camera.target;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		const s = clampZoom(outcome.zoom);
		this.#camera.glideTo({ s, x: cx - ((cx - from.x) * s) / from.s, y: cy - ((cy - from.y) * s) / from.s });
		this.fitted = false;
	}
	zoomIn(): void {
		this.#zoomByStep(zoomIn(this.#camera.target.s));
	}
	zoomOut(): void {
		this.#zoomByStep(zoomOut(this.#camera.target.s));
	}

	pan(dx: number, dy: number): void {
		this.#camera.panBy(dx, dy);
		this.fitted = false;
	}

	// Pan from clientX/Y deltas, not movementX/Y: movement* is reported in raw device
	// pixels on some browsers, so under display scaling the diagram drifts off the cursor.
	// A press pans from anywhere once it travelled past the threshold (canvas-gesture.ts):
	// under it, a click on a box, a link or a button stays theirs. Two fingers pinch.
	onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || keepsPress(event.target)) return;
		this.#gesture.press(event.pointerId, event.clientX, event.clientY, event.timeStamp);
		this.#camera.hold();
	};
	onPointerMove = (event: PointerEvent): void => {
		const step = this.#gesture.move(event.pointerId, event.clientX, event.clientY, event.timeStamp);
		if (!step) return;
		const el = event.currentTarget as HTMLElement;
		if (!el.hasPointerCapture(event.pointerId)) el.setPointerCapture(event.pointerId);
		if (!this.dragging) {
			this.dragging = true;
			window.getSelection()?.removeAllRanges();
		}
		this.#camera.panBy(step.dx, step.dy);
		if (step.factor !== 1) {
			const rect = el.getBoundingClientRect();
			this.zoomAt(step.factor, step.cx - rect.left, step.cy - rect.top);
		}
		this.fitted = false;
	};
	onPointerUp = (event: PointerEvent): void => {
		const el = event.currentTarget as HTMLElement;
		el.releasePointerCapture?.(event.pointerId);
		const released = this.#gesture.release(event.pointerId, event.timeStamp);
		if (!released) return;
		if (released.moved) swallowNextClick(el);
		this.dragging = false;
		this.#camera.release(released.vx, released.vy);
	};
	onKeyDown = (event: KeyboardEvent): void => {
		const step = event.shiftKey ? 80 : 24;
		const moves: Record<string, () => void> = {
			ArrowLeft: () => this.pan(step, 0),
			ArrowRight: () => this.pan(-step, 0),
			ArrowUp: () => this.pan(0, step),
			ArrowDown: () => this.pan(0, -step),
			'+': () => this.zoomIn(),
			'=': () => this.zoomIn(),
			'-': () => this.zoomOut(),
			'0': () => this.showAll()
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		move();
	};
}
