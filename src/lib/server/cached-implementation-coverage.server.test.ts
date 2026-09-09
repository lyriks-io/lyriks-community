import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CachedImplementationCoverage } from './cached-implementation-coverage.server';
import { publishSectionChange, subscribeSectionChanges } from './sync-bus.server';
import type { LoadImplementationCoverageUseCase } from '$application/use-cases';

const ROW = {
	featureId: 'feat-a',
	found: 3,
	expected: 4,
	percent: 75,
	updatedAt: '2026-08-16T10:00:00.000Z',
	specUpdatedAt: null
};

/** Let queued microtasks (the fire-and-forget refresh) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function cache(execute: () => Promise<Record<string, typeof ROW>>) {
	return new CachedImplementationCoverage({ execute } as unknown as LoadImplementationCoverageUseCase);
}

describe('CachedImplementationCoverage', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('serves the first read instantly empty, then the snapshot once the background load lands', async () => {
		const load = vi.fn(async () => ({ 'feat-a': ROW }));
		const tier = cache(load);

		await expect(tier.get('p1')).resolves.toEqual({});
		await settle();
		await expect(tier.get('p1')).resolves.toEqual({ 'feat-a': ROW });
		// The second read is within TTL: served from the snapshot, no new engine walk.
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('publishes a features-implementation change when the background refresh changes the data', async () => {
		const seen: string[] = [];
		const unsubscribe = subscribeSectionChanges(({ projectId, section }) => {
			if (projectId === 'p2') seen.push(section);
		});
		const tier = cache(async () => ({ 'feat-a': ROW }));

		await tier.get('p2');
		await settle();
		unsubscribe();
		expect(seen).toEqual(['features-implementation']);
	});

	it('invalidate() recomputes promptly instead of waiting out the TTL', async () => {
		let coverage: Record<string, typeof ROW> = {};
		const load = vi.fn(async () => coverage);
		const tier = cache(load);

		await tier.get('p3');
		await settle();
		coverage = { 'feat-a': ROW };
		tier.invalidate('p3');
		await settle();

		await expect(tier.get('p3')).resolves.toEqual({ 'feat-a': ROW });
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('stales the snapshot when the features section changes, so the next read refreshes', async () => {
		let coverage: Record<string, typeof ROW> = { 'feat-a': ROW };
		const load = vi.fn(async () => coverage);
		const tier = cache(load);

		await tier.get('p4');
		await settle();
		coverage = {};
		publishSectionChange({ projectId: 'p4', section: 'features', origin: null });
		await settle();

		// Staled, not cleared: this read still serves the last snapshot instantly
		// while kicking the refresh that the following read then observes.
		await expect(tier.get('p4')).resolves.toEqual({ 'feat-a': ROW });
		await settle();
		await expect(tier.get('p4')).resolves.toEqual({});
	});

	it('keeps the last snapshot when a refresh fails', async () => {
		let fail = false;
		const tier = cache(async () => {
			if (fail) throw new Error('engine down');
			return { 'feat-a': ROW };
		});

		await tier.get('p5');
		await settle();
		fail = true;
		tier.invalidate('p5');
		await settle();

		await expect(tier.get('p5')).resolves.toEqual({ 'feat-a': ROW });
	});
});

describe('CachedImplementationCoverage persisted snapshot', () => {
	it('serves the stored snapshot on the first read of a fresh process, then refreshes it', async () => {
		const stored = { 'feat-a': ROW };
		const fresh = { 'feat-a': { ...ROW, found: 4, percent: 100 } };
		const store = { load: vi.fn(async () => stored), save: vi.fn(async () => {}) };
		const load = vi.fn(async () => fresh);
		const tier = new CachedImplementationCoverage(
			{ execute: load } as unknown as LoadImplementationCoverageUseCase,
			{ store }
		);

		// A restart no longer costs a whole background cycle of empty chips.
		await expect(tier.get('p-restart')).resolves.toEqual(stored);
		await settle();
		await expect(tier.get('p-restart')).resolves.toEqual(fresh);
		expect(store.save).toHaveBeenCalledWith('p-restart', fresh);
	});

	it('starts empty when the store has nothing or fails, without breaking the read', async () => {
		const store = { load: vi.fn(async () => { throw new Error('db down'); }), save: vi.fn(async () => {}) };
		const tier = new CachedImplementationCoverage(
			{ execute: async () => ({ 'feat-a': ROW }) } as unknown as LoadImplementationCoverageUseCase,
			{ store }
		);

		await expect(tier.get('p-cold')).resolves.toEqual({});
		await settle();
		await expect(tier.get('p-cold')).resolves.toEqual({ 'feat-a': ROW });
	});
});
