import { describe, it, expect } from 'vitest';
import { createEmptyFeaturesDraft, createCore, createFeature } from './draft';
import { maturityByCore, maturityByFeature } from './maturity-breakdown';

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
