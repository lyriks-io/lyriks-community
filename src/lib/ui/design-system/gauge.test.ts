import { describe, expect, it } from 'vitest';
import { MAX_COUNTED_CELLS, gaugeDrawing, slantedOutline } from './gauge';

const filled = (cells: readonly (number | null)[]) => cells.filter((c) => c !== null).length;

describe('a bar counts one cell per thing it counts [criterion:7beb0b83]', () => {
	it('fills as many cells as its count, out of the largest count of its list', () => {
		expect(gaugeDrawing([6], 11, true)).toEqual({ kind: 'cells', cells: [0, 0, 0, 0, 0, 0, null, null, null, null, null] });
		const whole = gaugeDrawing([11], 11, true);
		expect(whole.kind === 'cells' && filled(whole.cells)).toBe(11);
		expect(gaugeDrawing([0], 4, true)).toEqual({ kind: 'cells', cells: [null, null, null, null] });
	});

	it('draws the bar whole once the cells would be too thin to count', () => {
		expect(gaugeDrawing([MAX_COUNTED_CELLS], MAX_COUNTED_CELLS, true).kind).toBe('cells');
		expect(gaugeDrawing([30], 60, true)).toEqual({ kind: 'share', filled: 50, weights: [30] });
		expect(gaugeDrawing([1], 200, true)).toEqual({ kind: 'share', filled: 2, weights: [1] });
	});

	it('draws nothing filled for a list where everything counts zero', () => {
		expect(gaugeDrawing([0], 0, true)).toEqual({ kind: 'share', filled: 0, weights: [0] });
	});

	it('draws each cell as a parallelogram, both sides leaning the same way', () => {
		expect(slantedOutline(16)).toBe('polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)');
	});
});

describe('every progress bar follows the law of the bars [criterion:b663dee4]', () => {
	it('fills the parts of a counted bar in order, each in its own cells', () => {
		// 3 tested, 2 found, out of 8 lines.
		expect(gaugeDrawing([3, 2], 8, true)).toEqual({ kind: 'cells', cells: [0, 0, 0, 1, 1, null, null, null] });
	});

	it('never fills more cells than the bar holds', () => {
		expect(gaugeDrawing([4, 4], 5, true)).toEqual({ kind: 'cells', cells: [0, 0, 0, 0, 1] });
	});

	it('draws a percentage whole, never in cells that count nothing', () => {
		expect(gaugeDrawing([40], 100, false)).toEqual({ kind: 'share', filled: 40, weights: [40] });
		expect(gaugeDrawing([3], 5, false).kind).toBe('share');
	});

	it('puts the parts of a bar drawn whole side by side, in order', () => {
		expect(gaugeDrawing([30, 20], 100, false)).toEqual({ kind: 'share', filled: 50, weights: [30, 20] });
	});

	it('keeps one angle whatever the height', () => {
		for (const h of [4, 8, 12, 16]) expect(slantedOutline(h)).toContain(`${h / 4}px 0,`);
		expect(slantedOutline(6)).toBe('polygon(1.5px 0, 100% 0, calc(100% - 1.5px) 100%, 0 100%)');
	});
});
