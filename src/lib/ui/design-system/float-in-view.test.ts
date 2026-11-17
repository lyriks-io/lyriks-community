import { describe, expect, it } from 'vitest';
import { EDGE, GAP, clickedWithin, placeFloating } from './float-in-view';

const win = { width: 1000, height: 800 };
const button = (left: number, top: number, width = 100, height = 40) => ({ left, top, right: left + width, bottom: top + height });

describe('every menu, dropdown and list opens whole, inside the window [criterion:5651ca29]', () => {
	it('opens under its button, on its left edge, or on its right edge when asked', () => {
		expect(placeFloating(button(100, 100), { width: 300, height: 200 }, win)).toEqual({ top: 140 + GAP, left: 100, maxHeight: null, above: false });
		expect(placeFloating(button(500, 100), { width: 300, height: 200 }, win, 'right').left).toBe(300);
	});

	it('moves left from the right edge and right from the left edge, never past the window', () => {
		// The data map Filters: a button near the right edge, a 312 px panel.
		expect(placeFloating(button(880, 100), { width: 312, height: 200 }, win).left).toBe(1000 - EDGE - 312);
		expect(placeFloating(button(20, 100), { width: 312, height: 200 }, win, 'right').left).toBe(EDGE);
	});

	it('opens above when the room below is too short and above holds it', () => {
		const at = placeFloating(button(100, 600), { width: 300, height: 400 }, win);
		expect(at.above).toBe(true);
		expect(at.top).toBe(600 - GAP - 400);
		expect(at.maxHeight).toBeNull();
	});

	it('opens above by design whenever it fits there, below otherwise', () => {
		expect(placeFloating(button(100, 600), { width: 300, height: 200 }, win, 'left', 'above')).toMatchObject({ top: 600 - GAP - 200, above: true });
		expect(placeFloating(button(100, 100), { width: 300, height: 200 }, win, 'left', 'above')).toMatchObject({ top: 140 + GAP, above: false });
	});

	it('scrolls inside itself on the taller side when the window is shorter than it', () => {
		const below = placeFloating(button(100, 100), { width: 300, height: 2000 }, win);
		expect(below).toEqual({ top: 140 + GAP, left: 100, maxHeight: 800 - EDGE - (140 + GAP), above: false });
		const above = placeFloating(button(100, 700), { width: 300, height: 2000 }, win);
		expect(above).toEqual({ top: EDGE, left: 100, maxHeight: 700 - GAP - EDGE, above: true });
	});

	it('counts a click inside the floating panel as inside the component', () => {
		const inner = {} as EventTarget;
		const holding = (...held: EventTarget[]) => ({ contains: (n: Node | null) => held.includes(n as EventTarget) });
		const root = holding();
		const panel = holding(inner);
		expect(clickedWithin(inner, root, panel)).toBe(true);
		expect(clickedWithin({} as EventTarget, root, panel)).toBe(false);
		expect(clickedWithin(null, root, panel)).toBe(false);
		expect(clickedWithin(inner, root, null)).toBe(false);
	});
});
