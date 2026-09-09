import { describe, expect, it } from 'vitest';
import { SweepImplementationGapsUseCase } from './sweep-implementation-gaps';
import type { CodeAdoptionPort } from '../ports';

const FEATURES = {
	features: [
		{ id: 'feat-a', name: 'Send invoices', parentId: null },
		{ id: 'feat-b', name: 'Archive invoices', parentId: null },
		{ id: 'feat-c', name: 'Never adopted', parentId: null }
	],
	cores: [],
	releases: [],
	roadmapAssignments: []
};

const gaps = (stats: { total: number; implemented: number; partial: number; missing: number }) => ({
	ok: true as const,
	value: { stats, missing: [], partial: [], implemented: [] }
});

function useCase(port: Partial<CodeAdoptionPort>) {
	return new SweepImplementationGapsUseCase({ execute: async () => FEATURES } as never, {
		available: true,
		...port
	} as CodeAdoptionPort);
}

describe('SweepImplementationGapsUseCase', () => {
	it('rolls every leaf up, worst first, and totals the project', async () => {
		const sweep = await useCase({
			getImplementationGaps: async (featureId: string) =>
				featureId === 'feat-a'
					? gaps({ total: 10, implemented: 8, partial: 0, missing: 2 })
					: featureId === 'feat-b'
						? gaps({ total: 6, implemented: 1, partial: 0, missing: 5 })
						: gaps({ total: 0, implemented: 0, partial: 0, missing: 0 })
		}).execute('project-1', {});

		expect(sweep.features.map((f) => f.featureId)).toEqual(['feat-b', 'feat-a']);
		expect(sweep.totals).toEqual({
			features: 2,
			total: 16,
			implemented: 9,
			partial: 0,
			missing: 7
		});
		// A feature the spec declares nothing for is not a gap, so it stays out.
		expect(sweep.features.some((f) => f.featureId === 'feat-c')).toBe(false);
		expect(sweep.unavailable).toEqual([]);
	});

	it('names the leaves the engine could not answer for instead of counting them clean', async () => {
		const sweep = await useCase({
			getImplementationGaps: async (featureId: string) => {
				if (featureId === 'feat-a') throw new Error('engine hiccup');
				if (featureId === 'feat-b') return { ok: false as const, error: 'no such feature' } as never;
				return gaps({ total: 2, implemented: 2, partial: 0, missing: 0 });
			}
		}).execute('project-1', {});

		expect(sweep.unavailable.sort()).toEqual(['feat-a', 'feat-b']);
		expect(sweep.features.map((f) => f.featureId)).toEqual(['feat-c']);
	});

	it('counts the returned rows when the engine sends no stats block', async () => {
		const sweep = await useCase({
			getImplementationGaps: async () =>
				({
					ok: true as const,
					value: { missing: [{}, {}], partial: [{}], implemented: [{}, {}, {}] }
				}) as never
		}).execute('project-1', {});

		expect(sweep.features[0]).toMatchObject({ total: 6, implemented: 3, partial: 1, missing: 2 });
	});
});
