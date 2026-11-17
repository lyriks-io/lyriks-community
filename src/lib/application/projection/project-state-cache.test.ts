import { describe, expect, it, vi } from 'vitest';
import { ProjectStateCache } from './project-state-cache';

function setup() {
	const state = { revision: 'r1', kernel: 'k1', runs: 0 };
	const compute = vi.fn(async () => (state.runs += 1));
	const cache = new ProjectStateCache<number>({ fingerprint: async () => state.revision }, () => state.kernel);
	return { state, compute, cache };
}

describe('a reading is kept while the state of the spec has not moved', () => {
	it('serves the same reading, then computes again once a section or the behaviour folder moves', async () => {
		const { state, compute, cache } = setup();
		expect(await cache.read('p', compute)).toBe(1);
		expect(await cache.read('p', compute)).toBe(1);
		state.revision = 'r2';
		expect(await cache.read('p', compute)).toBe(2);
		state.kernel = 'k2';
		expect(await cache.read('p', compute)).toBe(3);
	});

	it('does not keep a reading it is told not to keep', async () => {
		const { compute, cache } = setup();
		await cache.read('p', compute, { keep: () => false });
		expect(await cache.read('p', compute, { keep: () => false })).toBe(2);
	});

	it('shares one computation between readers arriving together', async () => {
		const { compute, cache } = setup();
		await Promise.all([cache.read('p', compute), cache.read('p', compute)]);
		expect(compute).toHaveBeenCalledOnce();
	});

	it('drops the project read longest ago once it holds too many', async () => {
		const state = { runs: 0 };
		const compute = vi.fn(async () => (state.runs += 1));
		const cache = new ProjectStateCache<number>({ fingerprint: async () => 'r' }, () => 'k', 2);
		await cache.read('a', compute);
		await cache.read('b', compute);
		await cache.read('a', compute);
		await cache.read('c', compute);
		expect(compute).toHaveBeenCalledTimes(3);
		await cache.read('a', compute);
		expect(compute).toHaveBeenCalledTimes(3);
		await cache.read('b', compute);
		expect(compute).toHaveBeenCalledTimes(4);
	});

	it('does not keep a failure', async () => {
		const { compute, cache } = setup();
		compute.mockRejectedValueOnce(new Error('unreadable'));
		await expect(cache.read('p', compute)).rejects.toThrow('unreadable');
		expect(await cache.read('p', compute)).toBe(1);
	});

	it('keeps the newer revision when an older computation finishes last', async () => {
		const { state, cache } = setup();
		let finish!: (value: number) => void;
		const old = cache.read('p', () => new Promise((resolve) => { finish = resolve; }));
		await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
		state.revision = 'r2';
		const current = vi.fn(async () => 2);
		expect(await cache.read('p', current)).toBe(2);
		finish(1);
		expect(await old).toBe(1);
		expect(await cache.read('p', current)).toBe(2);
		expect(current).toHaveBeenCalledOnce();
	});
});
