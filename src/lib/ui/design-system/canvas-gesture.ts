import { VelocityTracker } from './canvas-motion';
import { PAN_THRESHOLD_PX } from './pan-gesture';

/**
 * Press and move a drawing with one pointer or two (ac-diag-fs-4, ac-diag-touch).
 * One pointer pans once it travelled past the threshold, so a press under it
 * stays a click; two pinch, zooming around the point between them while it
 * moves. Each pointer is followed by its own id, and a pointer that arrives or
 * leaves starts the next step from where the others are, so the drawing never
 * jumps from one finger to the other. The release says how fast it was thrown.
 */

/** One move of the drawing, in client pixels: pan by (dx, dy), then zoom by `factor` around (cx, cy). */
export interface CanvasStep {
	readonly dx: number;
	readonly dy: number;
	readonly factor: number;
	readonly cx: number;
	readonly cy: number;
}

/** How the gesture ended: whether it moved the drawing (the click it ends with is then not one), and its speed. */
export interface CanvasRelease {
	readonly moved: boolean;
	readonly vx: number;
	readonly vy: number;
}

type Point = { x: number; y: number };

const centre = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const apart = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export class CanvasGesture {
	#points = new Map<number, Point>();
	#origin: Point | null = null;
	#moving = false;
	#pinched = false;
	#tracker = new VelocityTracker();

	/** A pointer is down on the drawing. */
	get pressed(): boolean {
		return this.#points.size > 0;
	}

	/** The gesture moves the drawing (past the threshold, or pinching). */
	get moving(): boolean {
		return this.#moving;
	}

	/** How many pointers hold the drawing. */
	get count(): number {
		return this.#points.size;
	}

	press(id: number, x: number, y: number, t: number): void {
		this.#points.set(id, { x, y });
		this.#tracker.reset();
		if (this.#points.size === 1) {
			this.#origin = { x, y };
			this.#moving = false;
			this.#pinched = false;
			this.#tracker.add(x, y, t);
		} else {
			// A second finger pinches at once: a pinch is never a click.
			this.#moving = true;
			this.#pinched = true;
		}
	}

	/** The step to apply for this move, or null while it can still be a click (or the pointer is not ours). */
	move(id: number, x: number, y: number, t: number): CanvasStep | null {
		const before = this.#points.get(id);
		if (!before) return null;
		const ids = [...this.#points.keys()];
		if (ids.length === 1) {
			if (!this.#moving) {
				const from = this.#origin ?? before;
				if (Math.hypot(x - from.x, y - from.y) < PAN_THRESHOLD_PX) return null;
				this.#moving = true;
			}
			this.#points.set(id, { x, y });
			this.#tracker.add(x, y, t);
			return { dx: x - before.x, dy: y - before.y, factor: 1, cx: x, cy: y };
		}
		const [a, b] = ids;
		if (id !== a && id !== b) {
			this.#points.set(id, { x, y });
			return null;
		}
		const pa = this.#points.get(a)!;
		const pb = this.#points.get(b)!;
		const was = { mid: centre(pa, pb), span: apart(pa, pb) };
		this.#points.set(id, { x, y });
		const qa = this.#points.get(a)!;
		const qb = this.#points.get(b)!;
		const mid = centre(qa, qb);
		const span = apart(qa, qb);
		this.#tracker.add(mid.x, mid.y, t);
		return { dx: mid.x - was.mid.x, dy: mid.y - was.mid.y, factor: was.span > 0 && span > 0 ? span / was.span : 1, cx: mid.x, cy: mid.y };
	}

	/** A pointer leaves: null while another still holds the drawing (it carries the move on), the release otherwise. */
	release(id: number, t: number): CanvasRelease | null {
		if (!this.#points.delete(id)) return null;
		if (this.#points.size > 0) {
			this.#tracker.reset();
			const rest = [...this.#points.values()];
			const next = rest.length === 1 ? rest[0] : centre(rest[0], rest[1]);
			this.#tracker.add(next.x, next.y, t);
			return null;
		}
		const moved = this.#moving;
		// The last pointer of a pinch lets go of a zoom, not of a throw.
		const { vx, vy } = this.#pinched ? { vx: 0, vy: 0 } : this.#tracker.velocity(t);
		this.#origin = null;
		this.#moving = false;
		this.#pinched = false;
		return { moved, vx, vy };
	}

	/** Forget every pointer (the canvas went away mid-gesture). */
	cancel(): void {
		this.#points.clear();
		this.#tracker.reset();
		this.#origin = null;
		this.#moving = false;
		this.#pinched = false;
	}
}
