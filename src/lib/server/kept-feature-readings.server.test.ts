import { describe, expect, it } from 'vitest';
import { indexFeatureRules, rulesOfFeature } from '$application/specification/index-feature-rules';
import { indexFeatureScenarios } from '$application/specification/index-feature-actions';
import { featureStatements } from '$lib/unspa-schema/requirement-sentences';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { keptFeatureStatements, keptRulesOfFeature } from './kept-feature-readings.server';

function freezeDeep<T>(value: T): T {
	if (value && typeof value === 'object') {
		for (const child of Object.values(value)) freezeDeep(child);
		Object.freeze(value);
	}
	return value;
}

const feature = (name: string) => ({
	format: 'unspaghettit-feature',
	version: 1,
	feature: {
		id: 'feat-cart',
		name,
		surfaces: [
			{
				id: 's1',
				name: 'Cart',
				stateDefinitions: [{ path: 'cart.items', type: 'number', initial: 0 }],
				actions: [
					{
						id: 'a1',
						name: 'Add an item',
						rules: [{ id: 'r1', category: 'validation', condition: { left: 'cart.items', operator: 'greater_than', right: 9 }, effect: { type: 'block_action', message: 'The cart is full' } }],
						scenarios: [{ id: 'sc1', name: 'A full cart refuses', given: { 'cart.items': 10 }, expectedAssertions: [] }]
					}
				]
			}
		]
	}
}) as unknown as UnspaFeatureSnapshot;

describe('the readings kept per stored snapshot', () => {
	it('read a frozen snapshot once, the same as reading it each time', () => {
		const snap = freezeDeep(feature('Cart'));
		const borrowed = new Set<string>();
		const first = keptRulesOfFeature('feat-cart', snap, borrowed, 'en');
		expect(first.length).toBeGreaterThan(0);
		expect(first).toEqual(rulesOfFeature('feat-cart', snap, borrowed, 'en'));
		expect(keptRulesOfFeature('feat-cart', snap, borrowed, 'en')).toBe(first);
		// Another language, or other borrowed surfaces, is another reading.
		expect(keptRulesOfFeature('feat-cart', snap, borrowed, 'fr')).not.toBe(first);
		expect(keptRulesOfFeature('feat-cart', snap, new Set(['s1']), 'en')).not.toBe(first);

		const statements = keptFeatureStatements(snap.feature as Record<string, unknown>, 'en');
		expect(Object.keys(statements)).toEqual(expect.arrayContaining(['rule:r1', 'scenario:sc1']));
		expect(statements).toEqual(featureStatements(snap.feature, 'en'));
		expect(keptFeatureStatements(snap.feature as Record<string, unknown>, 'en')).toBe(statements);
	});

	it('read again a snapshot that is not frozen, since it may change', () => {
		const snap = feature('Cart');
		const borrowed = new Set<string>();
		const first = keptRulesOfFeature('feat-cart', snap, borrowed, 'en');
		(snap.feature as { name: string }).name = 'Basket';
		const again = keptRulesOfFeature('feat-cart', snap, borrowed, 'en');
		expect(again).not.toBe(first);
		expect(again).toEqual(rulesOfFeature('feat-cart', snap, borrowed, 'en'));
		expect(keptFeatureStatements(snap.feature as Record<string, unknown>, 'en')).not.toBe(keptFeatureStatements(snap.feature as Record<string, unknown>, 'en'));
	});

	it('give the fold the same rules and scenarios as before', () => {
		const snapshots = [{ featureId: 'feat-cart', snapshot: freezeDeep(feature('Cart')) }];
		expect(indexFeatureRules(null, snapshots, 'en', keptRulesOfFeature)).toEqual(indexFeatureRules(null, snapshots, 'en'));
		expect(indexFeatureScenarios(snapshots, 'en', keptFeatureStatements)).toEqual(indexFeatureScenarios(snapshots, 'en'));
	});
});
