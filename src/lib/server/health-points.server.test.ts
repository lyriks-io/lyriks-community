import { describe, expect, it } from 'vitest';
import type { Gap } from '$domain/coherence';
import { healthPointFinder } from './health-points.server';

const point = (id: string) => ({ id, title: id, blocking: false }) as unknown as Gap;

describe('an evolution opens on any point What Lyriks noticed', () => {
	it('finds a code point and an audit point, not only a coherence gap', async () => {
		const find = healthPointFinder(async () => [point('gap:rules-1'), point('code:criteria-unverified:feat-gifs'), point('audit:sources')], async () => []);
		expect((await find('code:criteria-unverified:feat-gifs'))?.id).toBe('code:criteria-unverified:feat-gifs');
		expect((await find('audit:sources'))?.id).toBe('audit:sources');
	});

	it('looks in a reading taken now for a point the shown reading does not hold yet, once for the batch', async () => {
		let freshReads = 0;
		const find = healthPointFinder(async () => [], async () => (freshReads++, [point('code:unproven:feat-new')]));
		expect((await find('code:unproven:feat-new'))?.id).toBe('code:unproven:feat-new');
		expect(await find('gone')).toBeNull();
		expect(freshReads).toBe(1);
	});

	it('answers none when no reading can be had', async () => {
		const find = healthPointFinder(
			() => Promise.reject(new Error('engine down')),
			() => Promise.reject(new Error('engine down'))
		);
		expect(await find('code:criteria-unverified:feat-gifs')).toBeNull();
	});
});
