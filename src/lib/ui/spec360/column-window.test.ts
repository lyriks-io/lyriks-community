import { describe, expect, it } from 'vitest';
import { columnWindow } from './column-window';

describe('Who can do what opens on its own page and holds any number of users [criterion:5787390d]', () => {
	it('draws only the user columns in view, and a few on each side', () => {
		// 1000 users of 96 px in a 1200 px view, the names column 280 px wide.
		expect(columnWindow(0, 1200, 1000, 96, 280)).toEqual({ start: 0, end: 17 });
		const scrolled = columnWindow(48_000, 1200, 1000, 96, 280);
		expect(scrolled.end - scrolled.start).toBeLessThan(30);
		expect(scrolled.start * 96 + 280).toBeLessThanOrEqual(48_000);
		expect(scrolled.end * 96).toBeGreaterThanOrEqual(48_000 + 1200 - 280);
	});

	it('draws every column when they all fit, and never past the last one', () => {
		expect(columnWindow(0, 1600, 3, 96, 280)).toEqual({ start: 0, end: 3 });
		expect(columnWindow(96_500, 1200, 1000, 96, 280)).toEqual({ start: 998, end: 1000 });
	});
});
