import { describe, expect, it } from 'vitest';
import { TOOLTIP_DELAY_MS, TOOLTIP_WARM_MS, tooltipDelay, warmUntilAfter } from './tooltip-timing';

describe('from one tooltip to the next without waiting [criterion:9da8bb6e]', () => {
	it('makes the first tooltip of a while wait as long as the system does', () => {
		expect(tooltipDelay(false, 5000, 0)).toBe(TOOLTIP_DELAY_MS);
	});

	it('shows a neighbour at once while one shows or just after it closed', () => {
		expect(tooltipDelay(true, 5000, 0)).toBe(0);
		const warm = warmUntilAfter(true, 5000, false, 0);
		expect(warm).toBe(5000 + TOOLTIP_WARM_MS);
		expect(tooltipDelay(false, 5000 + TOOLTIP_WARM_MS - 1, warm)).toBe(0);
		expect(tooltipDelay(false, 5000 + TOOLTIP_WARM_MS, warm)).toBe(TOOLTIP_DELAY_MS);
	});

	it('cools down at once after a press, a scroll or Escape', () => {
		expect(warmUntilAfter(true, 5000, true, 9999)).toBe(0);
	});
});
