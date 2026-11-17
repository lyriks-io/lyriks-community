import { describe, expect, it } from 'vitest';
import { PAN_THRESHOLD_PX, PanGesture } from './pan-gesture';

describe('press and move to pan', () => {
	it('stays a click while the pointer has not travelled past the threshold', () => {
		const g = new PanGesture();
		g.press(100, 100);
		expect(g.move(102, 103)).toBeNull();
		expect(g.panning).toBe(false);
		expect(g.release()).toBe(false);
	});

	it('pans past the threshold, by the whole way travelled since the press, then step by step', () => {
		const g = new PanGesture();
		g.press(100, 100);
		expect(g.move(100 + PAN_THRESHOLD_PX, 100)).toEqual({ dx: PAN_THRESHOLD_PX, dy: 0 });
		expect(g.move(110, 96)).toEqual({ dx: 10 - PAN_THRESHOLD_PX, dy: -4 });
		expect(g.release()).toBe(true);
	});

	it('does nothing without a press, and starts afresh at the next one', () => {
		const g = new PanGesture();
		expect(g.move(50, 50)).toBeNull();
		g.press(0, 0);
		g.move(20, 0);
		g.release();
		g.press(0, 0);
		expect(g.move(3, 0)).toBeNull();
	});
});
