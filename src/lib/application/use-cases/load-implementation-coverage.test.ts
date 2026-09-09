import { describe, expect, it, vi } from 'vitest';
import { LoadImplementationCoverageUseCase } from './load-implementation-coverage';
import type { BehaviorRepositoryPort, CodeAdoptionPort } from '../ports';

/** Two leaves under one core; ids are what the engine is asked for. */
const FEATURES = {
	features: [
		{ id: 'feat-a', name: 'Send invoices', parentId: null },
		{ id: 'feat-b', name: 'Archive invoices', parentId: null }
	],
	cores: [],
	releases: [],
	roadmapAssignments: []
};

/** A behavior store whose shells carry the given spec stamps. */
function shells(updatedAt: Record<string, string | undefined> = {}) {
	return {
		loadFeature: async (_projectId: string, featureId: string) =>
			featureId in updatedAt ? { feature: { id: featureId, updatedAt: updatedAt[featureId] } } : null
	} as unknown as BehaviorRepositoryPort;
}

function useCase(port: Partial<CodeAdoptionPort>, behavior: BehaviorRepositoryPort = shells()) {
	return new LoadImplementationCoverageUseCase(
		{ execute: async () => FEATURES } as never,
		{ available: true, ...port } as CodeAdoptionPort,
		behavior
	);
}

const sidecar = (value: Record<string, unknown>) => ({ ok: true as const, value });

describe('LoadImplementationCoverageUseCase', () => {
	it('folds found/expected across action and surface rows into a percent', async () => {
		const coverage = await useCase({
			getImplementationStatus: async (featureId: string) =>
				featureId === 'feat-a'
					? sidecar({
							updatedAt: '2026-08-15T10:00:00.000Z',
							actions: [
								{ foundEntities: [{}, {}], missingEntities: [{}], expectedEntities: [{}, {}, {}] }
							],
							surfaces: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }]
						})
					: sidecar({ status: null })
		}).execute('project-1');

		expect(coverage['feat-a']).toEqual({
			featureId: 'feat-a',
			found: 3,
			expected: 4,
			percent: 75,
			actions: {},
			updatedAt: '2026-08-15T10:00:00.000Z',
			specUpdatedAt: null
		});
		// A never-adopted feature has NO entry, so no chip ever renders for it.
		expect(coverage['feat-b']).toBeUndefined();
	});

	it('splits per-action coverage rows keyed by action id', async () => {
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({
					actions: [
						{
							actionId: 'act-1',
							foundEntities: [{}, {}],
							missingEntities: [],
							expectedEntities: [{}, {}]
						},
						{ actionId: 'act-2', foundEntities: [], missingEntities: [{}], expectedEntities: [{}] },
						// A row without an id still counts in the feature totals.
						{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }
					],
					surfaces: []
				})
		}).execute('project-1');

		expect(coverage['feat-a']?.actions).toEqual({
			'act-1': { found: 2, expected: 2, percent: 100 },
			'act-2': { found: 0, expected: 1, percent: 0 }
		});
		expect(coverage['feat-a']?.percent).toBe(75);
	});

	it('falls back to found+missing when a legacy row lacks expectedEntities', async () => {
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({ actions: [{ foundEntities: [{}], missingEntities: [{}, {}, {}] }], surfaces: [] })
		}).execute('project-1');

		expect(coverage['feat-a']?.percent).toBe(25);
		expect(coverage['feat-a']?.expected).toBe(4);
	});

	it('returns {} without touching the engine when it is unavailable', async () => {
		const spy = vi.fn();
		const coverage = await useCase({
			available: false,
			getImplementationStatus: spy
		} as Partial<CodeAdoptionPort>).execute('project-1');

		expect(coverage).toEqual({});
		expect(spy).not.toHaveBeenCalled();
	});

	it('swallows per-feature engine failures instead of failing the page', async () => {
		const coverage = await useCase({
			getImplementationStatus: async (featureId: string) => {
				if (featureId === 'feat-a') throw new Error('engine hiccup');
				return sidecar({
					actions: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }],
					surfaces: []
				});
			}
		}).execute('project-1');

		expect(coverage['feat-a']).toBeUndefined();
		expect(coverage['feat-b']?.percent).toBe(100);
	});
});

describe('LoadImplementationCoverageUseCase spec stamps', () => {
	const adopted = {
		getImplementationStatus: async () =>
			({
				ok: true as const,
				value: {
					updatedAt: '2026-08-15T10:00:00.000Z',
					actions: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }],
					surfaces: []
				}
			})
	};

	it('reads the kernel shell LIVE, so an edit after the sync is visible', async () => {
		const coverage = await useCase(
			adopted,
			shells({ 'feat-a': '2026-08-16T09:00:00.000Z' })
		).execute('project-1');

		expect(coverage['feat-a']?.specUpdatedAt).toBe('2026-08-16T09:00:00.000Z');
		expect(coverage['feat-a']?.updatedAt).toBe('2026-08-15T10:00:00.000Z');
	});

	it('keeps the coverage row when the shell is missing or unreadable', async () => {
		const missing = await useCase(adopted, shells()).execute('project-1');
		expect(missing['feat-a']?.percent).toBe(100);
		expect(missing['feat-a']?.specUpdatedAt).toBeNull();

		const broken = await useCase(adopted, {
			loadFeature: async () => {
				throw new Error('kernel folder gone');
			}
		} as unknown as BehaviorRepositoryPort).execute('project-1');
		expect(broken['feat-a']?.percent).toBe(100);
		expect(broken['feat-a']?.specUpdatedAt).toBeNull();
	});
});
