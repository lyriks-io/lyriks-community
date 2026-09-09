import { describe, expect, it, vi } from 'vitest';
import type { BehaviorAdvisory } from '$application/ports';
import type { ComputeBehaviorAdvisoriesUseCase } from '$application/use-cases';
import { CachedBehaviorAdvisor } from './cached-behavior-advisor.server';

vi.mock('./sync-bus.server', () => ({ publishSectionChange: () => {} }));

const advisory = (code: string): BehaviorAdvisory =>
	({ code, severity: 'high', title: code, detail: '' }) as BehaviorAdvisory;

/** A compute the test can hold open, to observe what each caller sees meanwhile. */
function deferredCompute(data: BehaviorAdvisory[]) {
	let release!: () => void;
	let runs = 0;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const compute = {
		execute: async () => {
			runs++;
			await gate;
			return data;
		}
	} as unknown as ComputeBehaviorAdvisoriesUseCase;
	return { compute, release: () => release(), runs: () => runs };
}

describe('CachedBehaviorAdvisor', () => {
	it('serves the empty set on a first read and fills behind it', async () => {
		const { compute, release } = deferredCompute([advisory('unspa-x')]);
		const advisor = new CachedBehaviorAdvisor(compute);

		// The read path must never block a page load on the engine.
		await expect(advisor.get('proj')).resolves.toEqual([]);
		release();
		await advisor.prime('proj');

		await expect(advisor.get('proj')).resolves.toEqual([advisory('unspa-x')]);
	});

	it('prime waits for the real answer, so a fresh project reads like any other', async () => {
		const { compute, release } = deferredCompute([advisory('unspa-y')]);
		const advisor = new CachedBehaviorAdvisor(compute);

		let primed = false;
		const priming = advisor.prime('proj').then(() => (primed = true));
		await Promise.resolve();
		expect(primed).toBe(false); // still computing: prime does not return early

		release();
		await priming;
		expect(primed).toBe(true);
		await expect(advisor.get('proj')).resolves.toEqual([advisory('unspa-y')]);
	});

	it('joins the refresh already in flight instead of starting a second', async () => {
		const { compute, release, runs } = deferredCompute([advisory('unspa-z')]);
		const advisor = new CachedBehaviorAdvisor(compute);

		await advisor.get('proj'); // kicks the background refresh
		const priming = advisor.prime('proj'); // must join it, not queue another
		release();
		await priming;

		expect(runs()).toBe(1);
	});

	it('returns straight away when the cache is already warm', async () => {
		const { compute, release, runs } = deferredCompute([]);
		const advisor = new CachedBehaviorAdvisor(compute);

		release();
		await advisor.prime('proj');
		await advisor.prime('proj');

		expect(runs()).toBe(1);
	});

	it('gives up rather than hang when the engine fails', async () => {
		const compute = {
			execute: async () => {
				throw new Error('engine down');
			}
		} as unknown as ComputeBehaviorAdvisoriesUseCase;
		const advisor = new CachedBehaviorAdvisor(compute);

		await expect(advisor.prime('proj')).resolves.toBeUndefined();
		await expect(advisor.get('proj')).resolves.toEqual([]);
	});
});

describe('CachedBehaviorAdvisor persisted snapshot', () => {
	const settle = () => new Promise((r) => setTimeout(r, 0));

	it('serves the stored list on the first read of a fresh process, then refreshes and saves it', async () => {
		const stored = [advisory('stale')];
		const fresh = [advisory('fresh')];
		const store = { load: vi.fn(async () => stored), save: vi.fn(async () => {}) };
		const compute = { execute: vi.fn(async () => fresh) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute, { store });

		// A restart no longer costs a whole background pass of empty rings.
		await expect(tier.get('p-restart')).resolves.toEqual(stored);
		await settle();
		await settle();
		await expect(tier.get('p-restart')).resolves.toEqual(fresh);
		expect(store.save).toHaveBeenCalledWith('p-restart', fresh);
	});

	it('reads the store once for concurrent first reads', async () => {
		const store = { load: vi.fn(async () => null), save: vi.fn(async () => {}) };
		const compute = { execute: vi.fn(async () => []) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute, { store });
		await Promise.all([tier.get('p'), tier.get('p'), tier.get('p')]);
		expect(store.load).toHaveBeenCalledTimes(1);
	});
});
