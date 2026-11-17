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
		expect(store.save).toHaveBeenCalledWith('p-restart', { language: 'en', data: fresh });
	});

	it('reads the store once for concurrent first reads', async () => {
		const store = { load: vi.fn(async () => null), save: vi.fn(async () => {}) };
		const compute = { execute: vi.fn(async () => []) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute, { store });
		await Promise.all([tier.get('p'), tier.get('p'), tier.get('p')]);
		expect(store.load).toHaveBeenCalledTimes(1);
	});

	it('keeps the language with the list, and treats a list in another language as a miss', async () => {
		const settleAll = async () => {
			for (let i = 0; i < 4; i++) await settle();
		};
		let language: 'en' | 'fr' = 'fr';
		const store = {
			load: vi.fn(async () => ({ language: 'en' as const, data: [advisory('english')] })),
			save: vi.fn(async () => {})
		};
		const compute = {
			language: vi.fn(async () => language),
			execute: vi.fn(async () => [advisory(`cards-${language}`)])
		} as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute, { store });

		// The stored English cards are not served to a project that now declares French.
		await expect(tier.get('p')).resolves.toEqual([]);
		await settleAll();
		await expect(tier.get('p')).resolves.toEqual([advisory('cards-fr')]);
		expect(store.save).toHaveBeenCalledWith('p', { language: 'fr', data: [advisory('cards-fr')] });

		// The locale changes back: the French cards in memory are a miss too.
		language = 'en';
		await expect(tier.get('p')).resolves.toEqual([advisory('english')]);
		await settleAll();
		await expect(tier.get('p')).resolves.toEqual([advisory('cards-en')]);
	});

	it('reads a bare stored list, from before the language was kept, as English only', async () => {
		const store = { load: vi.fn(async () => [advisory('old')]), save: vi.fn(async () => {}) };
		const english = {
			language: async () => 'en',
			execute: vi.fn(async () => [])
		} as unknown as ComputeBehaviorAdvisoriesUseCase;
		await expect(new CachedBehaviorAdvisor(english, { store }).get('p')).resolves.toEqual([advisory('old')]);
		const french = {
			language: async () => 'fr',
			execute: vi.fn(async () => [])
		} as unknown as ComputeBehaviorAdvisoriesUseCase;
		await expect(new CachedBehaviorAdvisor(french, { store }).get('p')).resolves.toEqual([]);
	});
});

describe('CachedBehaviorAdvisor reaches every feature [criterion:ac-leaf-ac-score-engine-reaches-all]', () => {
	const capped = (unchecked: number): BehaviorAdvisory =>
		({ code: 'capped', severity: 'low', title: `${unchecked} left`, detail: '', unchecked }) as BehaviorAdvisory;
	const settleAll = async () => {
		for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
	};

	it('chains the next pass at once while features are left, until none is', async () => {
		const passes = [[capped(52)], [capped(12)], [advisory('done')]];
		const compute = { execute: vi.fn(async () => passes.shift() ?? []) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute);

		await tier.prime('p');
		await settleAll();

		// 92 features: three passes back to back, nobody reading in between.
		expect(compute.execute).toHaveBeenCalledTimes(3);
		await expect(tier.get('p')).resolves.toEqual([advisory('done')]);
	});

	it('stops chaining when a pass checks nothing more, so a feature the engine cannot stamp never loops it', async () => {
		const compute = { execute: vi.fn(async () => [capped(3)]) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute);

		await tier.prime('p');
		await settleAll();

		expect(compute.execute).toHaveBeenCalledTimes(2);
	});

	it('verifies again when a behaviour batch lands, without a reader', async () => {
		const compute = { execute: vi.fn(async () => []) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		const tier = new CachedBehaviorAdvisor(compute);
		await tier.prime('p');
		expect(compute.execute).toHaveBeenCalledTimes(1);

		tier.touch('p');
		await settleAll();
		expect(compute.execute).toHaveBeenCalledTimes(2);
	});

	it('runs one more pass after the one in flight when a batch lands meanwhile', async () => {
		const { compute, release, runs } = deferredCompute([]);
		const tier = new CachedBehaviorAdvisor(compute);
		const first = tier.prime('p');
		tier.touch('p');
		release();
		await first;
		await settleAll();

		expect(runs()).toBe(2);
	});

	it('leaves a project nobody read alone: nothing consumes its advisories', async () => {
		const compute = { execute: vi.fn(async () => []) } as unknown as ComputeBehaviorAdvisoriesUseCase;
		new CachedBehaviorAdvisor(compute).touch('never-read');
		await settleAll();
		expect(compute.execute).not.toHaveBeenCalled();
	});

	it('verifies again only when the behaviour model moved, however long it is read', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const { compute, release, runs } = deferredCompute([advisory('unspa-s')]);
		release();
		let signature = 'model-1';
		const advisor = new CachedBehaviorAdvisor(compute, { signature: () => signature });
		await advisor.prime('proj');
		expect(runs()).toBe(1);
		// Five minutes of page loads on the same model: the engine is left alone.
		vi.setSystemTime(Date.now() + 5 * 60_000);
		await advisor.get('proj');
		await advisor.prime('proj');
		expect(runs()).toBe(1);
		// The model moved: one more verification.
		signature = 'model-2';
		await advisor.get('proj');
		await advisor.prime('proj');
		expect(runs()).toBe(2);
		vi.useRealTimers();
	});
});
