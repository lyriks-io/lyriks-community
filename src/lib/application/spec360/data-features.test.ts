import { describe, expect, it } from 'vitest';
import { narrowTables, tablesByFeature } from './data-features';

describe('the tables each feature uses', () => {
	it('puts a table under the feature whose state carries one of its fields', () => {
		const fields = [
			{ id: 'f1', entityId: 'orders' },
			{ id: 'f2', entityId: 'orders' },
			{ id: 'f3', entityId: 'customers' }
		] as never;
		const behaviour = {
			links: new Map([
				['f1', 'cart.total'],
				['f3', 'profile.name'],
				['ghost', 'cart.total']
			]),
			states: [
				{ path: 'cart.total', owner: { featureId: 'checkout', surfaceId: 's1' } },
				{ path: 'profile.name', owner: { featureId: 'profile', surfaceId: 's2' } },
				{ path: 'orphan.state', owner: null }
			]
		} as never;
		expect(tablesByFeature({ fields }, behaviour)).toEqual({ checkout: ['orders'], profile: ['customers'] });
	});

	it('narrows the map to a feature, then to related or unrelated tables', () => {
		const all = new Set(['a', 'b', 'c']);
		const unrelated = new Set(['c']);
		expect([...narrowTables(all, { used: new Set(['a', 'c']), relations: 'all', unrelated })]).toEqual(['a', 'c']);
		expect([...narrowTables(all, { used: null, relations: 'unrelated', unrelated })]).toEqual(['c']);
		expect([...narrowTables(all, { used: null, relations: 'related', unrelated })]).toEqual(['a', 'b']);
	});
});
