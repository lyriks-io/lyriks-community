import { describe, expect, it } from 'vitest';
import { isIsoInstant } from './iso-instant';

describe('isIsoInstant', () => {
	it.each([
		'2026-09-20T10:15:30.123Z',
		'2026-09-20T10:15:30Z',
		'2026-09-20T10:15:30+02:00',
		'2026-09-20T10:15:30.5-05:30'
	])('accepts a full instant: %s', (value) => {
		expect(isIsoInstant(value)).toBe(true);
	});

	it.each([
		['a date alone', '2026-09-20'],
		['a local time without a zone', '2026-09-20T10:15:30'],
		['an impossible month', '2026-13-20T10:15:30Z'],
		['an impossible hour', '2026-09-20T25:15:30Z'],
		['free text', 'yesterday'],
		['an epoch number as text', '1790000000000'],
		['an empty string', '']
	])('refuses %s', (_label, value) => {
		expect(isIsoInstant(value)).toBe(false);
	});
});
