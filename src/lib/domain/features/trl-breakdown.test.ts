import { describe, it, expect } from 'vitest';
import { createEmptyFeaturesDraft, createCore, createFeature, createRelease } from './draft';
import {
	maturityByCore,
	maturityByFeature,
	maturityByRelease,
	UNPLANNED_RELEASE_ID
} from './trl-breakdown';

function draftWith(over: Partial<ReturnType<typeof createEmptyFeaturesDraft>>) {
	return { ...createEmptyFeaturesDraft('p1'), ...over };
}

describe('maturityByCore', () => {
	it('averages leaf maturity per core, in authored order', () => {
		const draft = draftWith({
			cores: [createCore({ id: 'c1', name: 'Products' }), createCore({ id: 'c2', name: 'Assets' })],
			features: [
				createFeature('c1', null, { id: 'x1' }),
				createFeature('c1', null, { id: 'x2' }),
				createFeature('c2', null, { id: 'x3' })
			]
		});
		const rows = maturityByCore(draft, { x1: 80, x2: 40, x3: 25 });
		expect(rows.map((r) => [r.name, r.score, r.featureCount])).toEqual([
			['Products', 60, 2],
			['Assets', 25, 1]
		]);
	});

	it('keeps a leafless core listed with a null score', () => {
		const rows = maturityByCore(draftWith({ cores: [createCore({ id: 'c1', name: 'Empty' })] }), {});
		expect(rows).toEqual([{ id: 'c1', name: 'Empty', detail: '', score: null, featureCount: 0 }]);
	});

	it('counts a leaf missing from the maturity map as 0, not skipped', () => {
		const draft = draftWith({
			cores: [createCore({ id: 'c1', name: 'Core' })],
			features: [createFeature('c1', null, { id: 'x1' }), createFeature('c1', null, { id: 'x2' })]
		});
		expect(maturityByCore(draft, { x1: 100 })[0].score).toBe(50);
	});
});

describe('maturityByFeature', () => {
	it('keeps every leaf visible with its own maturity and core name', () => {
		const draft = draftWith({
			cores: [createCore({ id: 'c1', name: 'Multiplayer' })],
			features: [createFeature('c1', null, { id: 'x1', name: 'Private match' })]
		});
		expect(maturityByFeature(draft, { x1: 93 })).toEqual([
			{
				id: 'x1',
				name: 'Private match',
				detail: 'Multiplayer',
				score: 93,
				featureCount: 1
			}
		]);
	});
});

describe('maturityByRelease', () => {
	const releases = [
		createRelease({ id: 'r2', name: 'Later', version: 'V1', order: 1, weekStart: 7, weekEnd: 12 }),
		createRelease({ id: 'r1', name: 'Core', version: 'V0', order: 0, weekStart: 1, weekEnd: 6 })
	];

	it('averages per release in roadmap order and carries the version + weeks detail', () => {
		const draft = draftWith({
			releases,
			features: [createFeature('c1', null, { id: 'x1' }), createFeature('c1', null, { id: 'x2' })],
			roadmapAssignments: [
				{ featureId: 'x1', releaseId: 'r1' },
				{ featureId: 'x2', releaseId: 'r2' }
			]
		});
		const rows = maturityByRelease(draft, { x1: 70, x2: 30 });
		expect(rows.map((r) => [r.id, r.detail, r.score])).toEqual([
			['r1', 'V0 · Weeks 1–6', 70],
			['r2', 'V1 · Weeks 7–12', 30]
		]);
	});

	it('appends an unplanned row when leaves are outside every release', () => {
		const draft = draftWith({
			releases,
			features: [createFeature('c1', null, { id: 'x1' }), createFeature('c1', null, { id: 'x2' })],
			roadmapAssignments: [{ featureId: 'x1', releaseId: 'r1' }]
		});
		const last = maturityByRelease(draft, { x1: 70, x2: 30 }).at(-1);
		expect(last).toMatchObject({ id: UNPLANNED_RELEASE_ID, score: 30, featureCount: 1 });
	});

	it('ignores orphaned assignments and shows an empty release as null', () => {
		const draft = draftWith({
			releases,
			roadmapAssignments: [{ featureId: 'ghost', releaseId: 'r1' }]
		});
		const rows = maturityByRelease(draft, {});
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ id: 'r1', score: null, featureCount: 0 });
	});
});
