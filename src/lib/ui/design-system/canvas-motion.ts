/**
 * The physics of a drawing moved by hand (ac-diag-throw, ac-diag-glide): how
 * far a throw carries on, how a drawing resists past its edge, the range it may
 * move in, and the spring that brings it home. Pure functions of numbers, so
 * every canvas (the diagrams, the data map, the knowledge graph) moves alike.
 */

/** How fast a throw slows, a millisecond at a time: the deceleration of a scroll on Apple's systems. */
export const DECELERATION = 0.998;
/** How much of the drawing stays in view, in CSS pixels, however far it is moved. */
export const KEEP_IN_VIEW_PX = 96;
/** A glide or a throw settles on a spring this quick (radians a second): about 0.4 s, without overshoot. */
export const GLIDE_OMEGA = (2 * Math.PI) / 0.4;
/** A release slower than this, in CSS pixels a second, is a drop rather than a throw. */
export const THROW_MIN_SPEED = 120;
/** The fastest a throw is taken to be, so a jittery last sample cannot fling the drawing away. */
export const THROW_MAX_SPEED = 6000;

/** How far a release at `velocity` (px/s) carries on before it stops, slowing by `rate` each millisecond. */
export function projectThrow(velocity: number, rate = DECELERATION): number {
	return ((velocity / 1000) * rate) / (1 - rate);
}

/** How far a drawing follows a pointer `overshoot` pixels past its edge: less and less the further it goes. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
	if (dimension <= 0) return 0;
	return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export interface PanRange {
	readonly min: number;
	readonly max: number;
}

/**
 * Where, along one axis, the drawing may sit (its offset `t` in the view) so a
 * strip of it stays in view: `start` and `size` are its extent in its own
 * units, `scale` how large it is drawn, `view` the length of the view.
 */
export function panRange(view: number, start: number, size: number, scale: number, keep = KEEP_IN_VIEW_PX): PanRange {
	const drawn = size * scale;
	const strip = Math.max(0, Math.min(keep, drawn, view / 2));
	return { min: strip - (start + size) * scale, max: view - strip - start * scale };
}

/** `value` held inside `range`. */
export const clampToRange = (value: number, range: PanRange): number => Math.min(range.max, Math.max(range.min, value));

/** `value` inside `range`, or past it by a rubber-banded share of how far it went (for a drag held past the edge). */
export function softClamp(value: number, range: PanRange, dimension: number): number {
	if (value < range.min) return range.min - rubberband(range.min - value, dimension);
	if (value > range.max) return range.max + rubberband(value - range.max, dimension);
	return value;
}

/** One coordinate on its way: where it is and how fast it goes (units a second). */
export interface Motion {
	readonly value: number;
	readonly velocity: number;
}

/**
 * Where a critically damped spring pulling toward `target` takes `motion` after
 * `dt` seconds. Exact whatever the step, so a glide runs the same on a 60 Hz
 * and on a 120 Hz screen, and it starts at the velocity it is given (a throw
 * hands its speed over, without a seam).
 */
export function stepSpring(motion: Motion, target: number, dt: number, omega = GLIDE_OMEGA): Motion {
	const c1 = motion.value - target;
	const c2 = motion.velocity + omega * c1;
	const decay = Math.exp(-omega * dt);
	return {
		value: target + (c1 + c2 * dt) * decay,
		velocity: (c2 - omega * (c1 + c2 * dt)) * decay
	};
}

/** Whether a spring has arrived: within `epsilon` of its target and all but still. */
export const springSettled = (motion: Motion, target: number, epsilon: number): boolean =>
	Math.abs(motion.value - target) < epsilon && Math.abs(motion.velocity) < epsilon * 10;

/** How fast a pointer went at its release, read from its last moves (px/s). */
export class VelocityTracker {
	// The moves this recent describe the release; older ones belong to the drag before it.
	static readonly WINDOW_MS = 100;
	// A pointer that rested this long before letting go was put down, not thrown.
	static readonly REST_MS = 60;
	#samples: { x: number; y: number; t: number }[] = [];

	add(x: number, y: number, t: number): void {
		this.#samples.push({ x, y, t });
		while (this.#samples.length > 2 && t - this.#samples[0].t > VelocityTracker.WINDOW_MS) this.#samples.shift();
	}

	reset(): void {
		this.#samples = [];
	}

	/** The velocity at `now`: zero when the pointer had rested, capped so one jittery sample cannot fling. */
	velocity(now: number): { vx: number; vy: number } {
		const first = this.#samples[0];
		const last = this.#samples[this.#samples.length - 1];
		if (!first || !last || last === first || now - last.t > VelocityTracker.REST_MS) return { vx: 0, vy: 0 };
		const dt = (last.t - first.t) / 1000;
		if (dt <= 0) return { vx: 0, vy: 0 };
		let vx = (last.x - first.x) / dt;
		let vy = (last.y - first.y) / dt;
		const speed = Math.hypot(vx, vy);
		if (speed > THROW_MAX_SPEED) {
			vx *= THROW_MAX_SPEED / speed;
			vy *= THROW_MAX_SPEED / speed;
		}
		return { vx, vy };
	}
}
