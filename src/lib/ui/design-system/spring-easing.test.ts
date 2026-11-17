import { describe, expect, it } from 'vitest';
import { springCurve } from './spring-easing';

describe('springCurve', () => {
	it('starts at 0 and ends exactly at 1', () => {
		const { points } = springCurve({ omega: 20, zeta: 0.75 });
		expect(points[0]).toBe(0);
		expect(points.at(-1)).toBe(1);
	});

	it('overshoots past 1 when under-damped, by the damping ratio', () => {
		const lively = Math.max(...springCurve({ omega: 20, zeta: 0.45 }).points);
		const calm = Math.max(...springCurve({ omega: 20, zeta: 0.75 }).points);
		expect(lively).toBeGreaterThan(calm);
		expect(calm).toBeGreaterThan(1);
		// The textbook overshoot exp(-pi zeta / sqrt(1 - zeta^2)), within sampling.
		expect(calm - 1).toBeCloseTo(Math.exp((-Math.PI * 0.75) / Math.sqrt(1 - 0.75 ** 2)), 2);
	});

	it('never overshoots when critically damped', () => {
		const { points } = springCurve({ omega: 15, zeta: 1 });
		expect(Math.max(...points)).toBe(1);
		expect(points.every((p, i) => i === 0 || p >= points[i - 1])).toBe(true);
	});

	it('settles sooner the stiffer it is, sampled once a frame', () => {
		const soft = springCurve({ omega: 15, zeta: 0.88 });
		const stiff = springCurve({ omega: 30, zeta: 0.88 });
		expect(stiff.duration).toBeLessThan(soft.duration);
		expect(Math.abs(soft.points.length - 1 - (soft.duration / 1000) * 60)).toBeLessThanOrEqual(1);
	});
});
