import { describe, expect, it } from 'vitest';
import { CanvasGesture } from './canvas-gesture';
import { PAN_THRESHOLD_PX } from './pan-gesture';

describe('one finger moves a diagram, two pinch it, and no finger makes it jump [criterion:ac-leaf-ac-diag-touch]', () => {
	it('stays a click under the threshold, then pans by the whole way travelled', () => {
		const g = new CanvasGesture();
		g.press(1, 100, 100, 0);
		expect(g.move(1, 102, 101, 10)).toBeNull();
		expect(g.move(1, 100 + PAN_THRESHOLD_PX, 100, 20)).toMatchObject({ dx: PAN_THRESHOLD_PX, dy: 0, factor: 1 });
		expect(g.release(1, 30)?.moved).toBe(true);
	});

	it('pinches around the point between two fingers', () => {
		const g = new CanvasGesture();
		g.press(1, 100, 100, 0);
		g.press(2, 200, 100, 0);
		expect(g.moving).toBe(true);
		const step = g.move(2, 300, 100, 16)!;
		expect(step.factor).toBeCloseTo(2);
		expect(step.cx).toBe(200);
		expect(step.cy).toBe(100);
		expect(step.dx).toBe(50);
	});

	it('never jumps when a second finger lands or one of two lifts', () => {
		const g = new CanvasGesture();
		g.press(1, 0, 0, 0);
		g.move(1, 50, 0, 10);
		// The second finger lands far away: the next move of the first counts from where the two stand.
		g.press(2, 400, 300, 20);
		const step = g.move(1, 52, 0, 30)!;
		expect(Math.abs(step.dx)).toBeLessThanOrEqual(1);
		expect(step.factor).toBeCloseTo(1, 1);
		// One of two lifts: the other carries the move on by its own steps.
		expect(g.release(2, 40)).toBeNull();
		expect(g.move(1, 60, 0, 50)).toMatchObject({ dx: 8, dy: 0, factor: 1 });
	});

	it('ignores a pointer it does not hold', () => {
		const g = new CanvasGesture();
		g.press(1, 0, 0, 0);
		expect(g.move(7, 50, 50, 10)).toBeNull();
		expect(g.release(7, 20)).toBeNull();
	});

	it('hands over the speed of a one-finger throw, none for a pinch', () => {
		const thrown = new CanvasGesture();
		thrown.press(1, 0, 0, 0);
		for (let t = 10; t <= 100; t += 10) thrown.move(1, t * 10, 0, t);
		expect(thrown.release(1, 105)!.vx).toBeGreaterThan(500);

		const pinched = new CanvasGesture();
		pinched.press(1, 0, 0, 0);
		pinched.press(2, 100, 0, 0);
		pinched.move(2, 300, 0, 10);
		pinched.release(2, 20);
		expect(pinched.release(1, 21)).toEqual({ moved: true, vx: 0, vy: 0 });
	});
});
