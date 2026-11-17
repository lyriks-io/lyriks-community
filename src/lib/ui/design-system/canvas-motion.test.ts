import { describe, expect, it } from 'vitest';
import { GLIDE_OMEGA, KEEP_IN_VIEW_PX, VelocityTracker, panRange, projectThrow, rubberband, softClamp, stepSpring } from './canvas-motion';

describe('a thrown drawing carries on, slows and keeps a strip in view [criterion:ac-leaf-ac-diag-throw]', () => {
	it('carries a throw on in its direction, further the faster it went', () => {
		expect(projectThrow(1000)).toBeCloseTo(499, 0);
		expect(projectThrow(-1000)).toBeCloseTo(-499, 0);
		expect(projectThrow(2000)).toBeGreaterThan(projectThrow(1000));
		expect(projectThrow(0)).toBe(0);
	});

	it('follows less and less past its edge', () => {
		const a = rubberband(50, 400);
		const b = rubberband(100, 400);
		const c = rubberband(150, 400);
		expect(a).toBeLessThan(50);
		expect(b).toBeGreaterThan(a);
		expect(b - a).toBeLessThan(a);
		expect(c - b).toBeLessThan(b - a);
	});

	it('keeps a strip of the drawing in view wherever it may stand', () => {
		const r = panRange(800, 0, 1000, 1);
		expect(r).toEqual({ min: KEEP_IN_VIEW_PX - 1000, max: 800 - KEEP_IN_VIEW_PX });
		// A drawing smaller than the strip keeps itself whole in view.
		const small = panRange(800, 0, 40, 1);
		expect(small.min).toBe(0);
		expect(small.max).toBe(760);
		// A drawing whose extent starts away from 0 (a graph's nodes) is ranged by that extent.
		expect(panRange(800, -500, 1000, 2)).toEqual({ min: KEEP_IN_VIEW_PX - 1000, max: 800 - KEEP_IN_VIEW_PX + 1000 });
	});

	it('resists a drag held past the edge without leaving it', () => {
		const r = { min: -500, max: 300 };
		expect(softClamp(100, r, 800)).toBe(100);
		const past = softClamp(500, r, 800);
		expect(past).toBeGreaterThan(300);
		expect(past).toBeLessThan(500);
		expect(softClamp(-900, r, 800)).toBeGreaterThan(-900);
	});

	it('reads the speed of a release from its last moves, and none from a pointer that rested', () => {
		const t = new VelocityTracker();
		for (let i = 0; i <= 10; i++) t.add(i * 10, 0, i * 10);
		const { vx, vy } = t.velocity(100);
		expect(vx).toBeCloseTo(1000, 0);
		expect(vy).toBe(0);
		expect(t.velocity(100 + VelocityTracker.REST_MS + 1)).toEqual({ vx: 0, vy: 0 });
	});
});

describe('a glide eases from where the drawing stands, the same on every screen [criterion:ac-leaf-ac-diag-glide]', () => {
	const run = (steps: number, seconds: number, from = { value: 0, velocity: 0 }) => {
		let m = from;
		for (let i = 0; i < steps; i++) m = stepSpring(m, 100, seconds / steps);
		return m;
	};

	it('lands at the same place at 60 Hz and at 120 Hz', () => {
		expect(run(15, 0.25).value).toBeCloseTo(run(30, 0.25).value, 6);
	});

	it('arrives without overshooting when it starts still', () => {
		let m = { value: 0, velocity: 0 };
		let highest = 0;
		for (let i = 0; i < 120; i++) {
			m = stepSpring(m, 100, 1 / 60);
			highest = Math.max(highest, m.value);
		}
		expect(highest).toBeLessThanOrEqual(100 + 1e-9);
		expect(m.value).toBeCloseTo(100, 2);
	});

	it('starts at the speed it is handed, without a seam', () => {
		// Its speed the instant it starts is the speed handed over.
		const dt = 1e-6;
		expect(stepSpring({ value: 0, velocity: 2000 }, 100, dt).value / dt).toBeCloseTo(2000, 0);
		expect(GLIDE_OMEGA).toBeGreaterThan(0);
	});
});
