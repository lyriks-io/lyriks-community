import {
	THROW_MIN_SPEED,
	clampToRange,
	panRange,
	projectThrow,
	softClamp,
	springSettled,
	stepSpring,
	type Motion,
	type PanRange
} from './canvas-motion';

/**
 * Where a canvas looks at its drawing, moved the way a hand expects
 * (ac-diag-throw, ac-diag-glide): a fit, a zoom button or a jump to an element
 * glide there on a spring from where the drawing stands; a press, a wheel or a
 * pinch takes over at once; a drag past the edge resists, and a release throws
 * the drawing on at the speed it had, then keeps a strip of it in view. The
 * camera holds no state of its own: it reads and writes the canvas's (`read`,
 * `write`), so each canvas keeps its own fields and its own drawing.
 */

/** The zoom and the offset of the drawing in its view. */
export interface CameraView {
	readonly s: number;
	readonly x: number;
	readonly y: number;
}

/** The view's size and the drawing's extent in its own units, for the edges. */
export interface CameraBounds {
	readonly view: { readonly w: number; readonly h: number };
	readonly content: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

export interface CameraOptions {
	readonly read: () => CameraView;
	readonly write: (view: CameraView) => void;
	readonly min: number;
	readonly max: number;
	readonly bounds?: () => CameraBounds | null;
	readonly reducedMotion?: () => boolean;
	readonly frame?: (step: (now: number) => void) => number;
	readonly cancelFrame?: (id: number) => void;
}

// A glide has arrived once it is this close: a quarter pixel, a twentieth of a percent of zoom.
const AT_PX = 0.25;
const AT_SCALE = 0.0005;
// A frame longer than this (a tab in the background) is taken as this long, so a glide never leaps.
const MAX_FRAME_S = 0.064;

const systemReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class CanvasCamera {
	readonly #o: CameraOptions;
	#raf = 0;
	#last = 0;
	#target: CameraView | null = null;
	#motion: { s: Motion; x: Motion; y: Motion } | null = null;
	// During a drag: where the drawing would stand without its edges.
	#raw: { x: number; y: number } | null = null;

	constructor(options: CameraOptions) {
		this.#o = options;
	}

	/** A glide is on its way. */
	get gliding(): boolean {
		return this.#target !== null;
	}

	/** Where the camera is heading: its glide's end, or where it stands. */
	get target(): CameraView {
		return this.#target ?? this.#o.read();
	}

	#reduced(): boolean {
		return (this.#o.reducedMotion ?? systemReducedMotion)();
	}

	#scale(s: number): number {
		return Math.min(this.#o.max, Math.max(this.#o.min, s));
	}

	#ranges(s: number): { x: PanRange; y: PanRange; w: number; h: number } | null {
		const b = this.#o.bounds?.();
		if (!b || b.content.w <= 0 || b.content.h <= 0 || b.view.w <= 0 || b.view.h <= 0) return null;
		return {
			x: panRange(b.view.w, b.content.x, b.content.w, s),
			y: panRange(b.view.h, b.content.y, b.content.h, s),
			w: b.view.w,
			h: b.view.h
		};
	}

	/** Stand at `view` at once (a layout change, the first frame, reduced motion). */
	jump(view: CameraView): void {
		this.stop();
		this.#o.write({ s: this.#scale(view.s), x: view.x, y: view.y });
	}

	/** Glide to `view` from where the drawing stands, keeping the speed it has (or the one a throw hands over). */
	glideTo(view: CameraView, velocity?: { x: number; y: number }): void {
		const to = { s: this.#scale(view.s), x: view.x, y: view.y };
		if (this.#reduced()) return this.jump(to);
		const now = this.#o.read();
		const was = this.#motion;
		this.#motion = {
			s: { value: now.s, velocity: was?.s.velocity ?? 0 },
			x: { value: now.x, velocity: velocity?.x ?? was?.x.velocity ?? 0 },
			y: { value: now.y, velocity: velocity?.y ?? was?.y.velocity ?? 0 }
		};
		this.#target = to;
		if (this.#raf) return;
		this.#last = 0;
		const frame = this.#o.frame ?? ((step) => requestAnimationFrame(step));
		const step = (t: number) => {
			const motion = this.#motion;
			const target = this.#target;
			if (!motion || !target) return void (this.#raf = 0);
			const dt = this.#last ? Math.min(MAX_FRAME_S, Math.max(0, (t - this.#last) / 1000)) : 1 / 60;
			this.#last = t;
			const next = { s: stepSpring(motion.s, target.s, dt), x: stepSpring(motion.x, target.x, dt), y: stepSpring(motion.y, target.y, dt) };
			if (springSettled(next.s, target.s, AT_SCALE) && springSettled(next.x, target.x, AT_PX) && springSettled(next.y, target.y, AT_PX)) {
				this.#raf = 0;
				this.#motion = null;
				this.#target = null;
				this.#o.write(target);
				return;
			}
			this.#motion = next;
			this.#o.write({ s: next.s.value, x: next.x.value, y: next.y.value });
			this.#raf = frame(step);
		};
		this.#raf = frame(step);
	}

	/** Stop where the drawing stands. */
	stop(): void {
		if (this.#raf) (this.#o.cancelFrame ?? ((id) => cancelAnimationFrame(id)))(this.#raf);
		this.#raf = 0;
		this.#motion = null;
		this.#target = null;
	}

	/** A pointer takes the drawing: whatever moved it stops, from where it stands. */
	hold(): void {
		this.stop();
		const v = this.#o.read();
		this.#raw = { x: v.x, y: v.y };
	}

	/** Move by (dx, dy) under the pointer, resisting past the edges while the drawing is held. */
	panBy(dx: number, dy: number): void {
		this.stop();
		const v = this.#o.read();
		// Not held (the arrow keys): the edges stop the drawing outright.
		if (!this.#raw) return this.#o.write({ s: v.s, ...this.#inside(v.s, { x: v.x + dx, y: v.y + dy }) });
		this.#raw = { x: this.#raw.x + dx, y: this.#raw.y + dy };
		this.#o.write({ s: v.s, ...this.#held(v.s) });
	}

	/** Zoom by `factor` keeping the point (cx, cy) of the view where it is. */
	zoomAt(factor: number, cx: number, cy: number): void {
		const v = this.#o.read();
		const next = this.#scale(v.s * factor);
		if (next === v.s) return;
		this.stop();
		const base = this.#raw ?? { x: v.x, y: v.y };
		const moved = { x: cx - ((cx - base.x) * next) / v.s, y: cy - ((cy - base.y) * next) / v.s };
		if (this.#raw) {
			this.#raw = moved;
			return this.#o.write({ s: next, ...this.#held(next) });
		}
		this.#o.write({ s: next, ...this.#inside(next, moved) });
	}

	#inside(s: number, at: { x: number; y: number }): { x: number; y: number } {
		const r = this.#ranges(s);
		return r ? { x: clampToRange(at.x, r.x), y: clampToRange(at.y, r.y) } : at;
	}

	#held(s: number): { x: number; y: number } {
		const raw = this.#raw!;
		const r = this.#ranges(s);
		return r ? { x: softClamp(raw.x, r.x, r.w), y: softClamp(raw.y, r.y, r.h) } : raw;
	}

	/** The pointer lets go at (vx, vy) px/s: the drawing carries on and slows, then a strip of it stays in view. */
	release(vx = 0, vy = 0): void {
		this.#raw = null;
		const v = this.#o.read();
		if (this.#reduced() || Math.hypot(vx, vy) < THROW_MIN_SPEED) return this.settle();
		const r = this.#ranges(v.s);
		const end = { x: v.x + projectThrow(vx), y: v.y + projectThrow(vy) };
		this.glideTo({ s: v.s, x: r ? clampToRange(end.x, r.x) : end.x, y: r ? clampToRange(end.y, r.y) : end.y }, { x: vx, y: vy });
	}

	/** Bring the drawing back inside its edges, if it stands past them. */
	settle(): void {
		const v = this.#o.read();
		const r = this.#ranges(v.s);
		if (!r) return;
		const x = clampToRange(v.x, r.x);
		const y = clampToRange(v.y, r.y);
		if (x === v.x && y === v.y) return;
		if (this.#reduced()) return this.jump({ s: v.s, x, y });
		this.glideTo({ s: v.s, x, y });
	}
}
