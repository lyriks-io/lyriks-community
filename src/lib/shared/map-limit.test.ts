import { describe, expect, it } from 'vitest';
import { mapLimit } from './map-limit';

describe('mapLimit', () => {
	it('preserves input order regardless of completion order', async () => {
		const out = await mapLimit([30, 10, 20, 0], 2, async (ms, i) => {
			await new Promise((r) => setTimeout(r, ms));
			return i;
		});
		expect(out).toEqual([0, 1, 2, 3]);
	});

	it('never exceeds the concurrency width', async () => {
		let inFlight = 0;
		let peak = 0;
		await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight--;
		});
		expect(peak).toBeLessThanOrEqual(3);
	});

	it('handles an empty list', async () => {
		expect(await mapLimit([], 4, async () => 1)).toEqual([]);
	});

	it('rejects on the first error, like Promise.all', async () => {
		await expect(
			mapLimit([1, 2, 3], 2, async (x) => {
				if (x === 2) throw new Error('boom');
				return x;
			})
		).rejects.toThrow('boom');
	});
});
