import { describe, expect, it } from 'vitest';
import { settlesWithin } from './settles-within';

describe('a coherence reading waits for the behaviour verification within a deadline [criterion:ac-leaf-ac-evo-coh-same-reading]', () => {
	it('says the work settled when it answers in time, a failure included', async () => {
		await expect(settlesWithin(Promise.resolve(), 50)).resolves.toBe(true);
		await expect(settlesWithin(Promise.reject(new Error('engine down')), 50)).resolves.toBe(true);
	});

	it('says it did not when the deadline passes first', async () => {
		await expect(settlesWithin(new Promise(() => {}), 20)).resolves.toBe(false);
	});
});
