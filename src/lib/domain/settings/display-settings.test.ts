import { describe, expect, it } from 'vitest';
import { NEW_BADGE_RANGE, defaultDisplaySettings, normalizeDisplaySettings, parseDisplaySettings } from './display-settings';

describe("the app's settings say how long New lasts [criterion:8c1e9288]", () => {
	it('lasts one day by default', () => {
		expect(defaultDisplaySettings()).toEqual({ newBadgeDays: 1 });
		expect(normalizeDisplaySettings(null)).toEqual({ newBadgeDays: 1 });
	});

	it('takes 0 to 30 whole days and refuses the rest with the range', () => {
		expect(parseDisplaySettings({ newBadgeDays: 7 })).toEqual({ ok: true, settings: { newBadgeDays: 7 } });
		expect(parseDisplaySettings({ newBadgeDays: 0 })).toEqual({ ok: true, settings: { newBadgeDays: 0 } });
		for (const bad of [90, -1, 1.5, '3'])
			expect(parseDisplaySettings({ newBadgeDays: bad })).toEqual({ ok: false, refusal: NEW_BADGE_RANGE });
		expect(normalizeDisplaySettings({ newBadgeDays: 90 })).toEqual({ newBadgeDays: 1 });
	});
});
