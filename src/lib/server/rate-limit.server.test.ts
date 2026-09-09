import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rate-limit.server';

describe('RateLimiter', () => {
	it('allows up to the limit then blocks within the window', () => {
		const rl = new RateLimiter(3, 1000);
		expect(rl.check('a', 0)).toBe(true);
		expect(rl.check('a', 100)).toBe(true);
		expect(rl.check('a', 200)).toBe(true);
		expect(rl.check('a', 300)).toBe(false); // 4th hit, over the limit of 3
	});

	it('resets after the window elapses', () => {
		const rl = new RateLimiter(2, 1000);
		expect(rl.check('a', 0)).toBe(true);
		expect(rl.check('a', 0)).toBe(true);
		expect(rl.check('a', 0)).toBe(false);
		expect(rl.check('a', 1000)).toBe(true); // window rolled over
	});

	it('tracks keys independently', () => {
		const rl = new RateLimiter(1, 1000);
		expect(rl.check('a', 0)).toBe(true);
		expect(rl.check('b', 0)).toBe(true);
		expect(rl.check('a', 0)).toBe(false);
	});
});
