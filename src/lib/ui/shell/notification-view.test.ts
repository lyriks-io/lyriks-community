import { describe, expect, it } from 'vitest';
import { whenSaid } from './notification-view';

describe('A card of the feed opens its text on when it happened, on the reader’s clock [criterion:45137624]', () => {
	const now = Date.parse('2026-11-07T15:00:00.000Z');
	const ago = (ms: number) => new Date(now - ms).toISOString();
	const MIN = 60_000;
	const said = (at: string) => whenSaid(at, now, 'UTC');

	it('says minutes and hours within a day', () => {
		expect(said(ago(20_000))).toBe('Just now');
		expect(said(ago(MIN))).toBe('A minute ago');
		expect(said(ago(12 * MIN))).toBe('12 minutes ago');
		expect(said(ago(60 * MIN))).toBe('An hour ago');
		expect(said(ago(5 * 60 * MIN))).toBe('5 hours ago');
	});

	it('says the day and the hour past a day', () => {
		expect(said('2026-11-06T09:30:00.000Z')).toBe('Yesterday at 09:30');
		expect(said('2026-11-02T18:40:00.000Z')).toBe('On Monday at 18:40');
		expect(said('2026-10-28T18:40:00.000Z')).toBe('On 28 October at 18:40');
		expect(said('2025-10-28T18:40:00.000Z')).toBe('On 28 October 2025 at 18:40');
	});

	it('reads the day in the reader’s own time zone', () => {
		// 23:30 UTC on 5 November is already 6 November in Paris, the day before the 7th.
		expect(whenSaid('2026-11-05T23:30:00.000Z', now, 'Europe/Paris')).toBe('Yesterday at 00:30');
	});
});
