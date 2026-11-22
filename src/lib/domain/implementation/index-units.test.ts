import { describe, expect, it } from 'vitest';
import { featureIndexUnits, indexKeyOwners, keyPlaces } from './index';

/** Two features sharing a state path, as the kernel holds them. */
const CART = {
	id: 'feat-cart',
	events: [{ name: 'cart.paid' }, { name: 'cart.audited' }],
	entities: [{ id: 'e-order' }],
	featureInvariants: [{ id: 'fi-1' }],
	acceptanceCriteria: [{ id: 'c-pay' }],
	surfaces: [
		{
			id: 's-cart',
			stateDefinitions: [{ id: 'st-1', path: 'cart.total' }, { id: 'st-2', path: 'session.role' }],
			rules: [{ id: 'sr-1' }],
			invariants: [{ id: 'si-1' }],
			transitions: [{ id: 't-surface' }],
			actions: [
				{
					id: 'a-pay',
					emittedEvents: ['cart.paid'],
					rules: [{ id: 'r-funds' }, { id: 'r-role' }],
					invariants: [{ id: 'ai-1' }],
					transitions: [{ id: 't-pay' }],
					exposures: [{ id: 'x-route' }],
					// A disabled action keeps its keys: it is still in the specification (EVO-004).
					disabled: { by: 'ana', at: '2026-11-19T00:00:00.000Z', reason: 'set aside' }
				}
			]
		}
	]
};
const PROFILE = {
	id: 'feat-profile',
	surfaces: [{ id: 's-profile', stateDefinitions: [{ id: 'st-9', path: 'session.role' }], rules: [], invariants: [], transitions: [], actions: [] }]
};

describe('the units an index key travels with', () => {
	it('groups the keys of a feature the way a sync reports them: an action with its children, a surface with its own', () => {
		expect(featureIndexUnits(CART)).toEqual({
			featureId: 'feat-cart',
			units: [
				{ unit: 'action:a-pay', keys: ['action:a-pay', 'event:cart.paid', 'rule:r-funds', 'rule:r-role', 'invariant:ai-1', 'transition:t-pay'] },
				{ unit: 'surface:s-cart', keys: ['surface:s-cart', 'state:cart.total', 'state:session.role', 'surface_rule:sr-1', 'surface_invariant:si-1'] }
			],
			// What no report carries travels alone; a declared event an action emits travels with the action.
			alone: ['invariant:fi-1', 'event:cart.audited', 'entity:e-order', 'criterion:c-pay', 'transition:t-surface', 'exposure:x-route']
		});
	});

	it('names the feature and the unit of every key, a shared state once per feature, a removed element as an orphan [criterion:60ba2862]', () => {
		const features = [featureIndexUnits(CART), featureIndexUnits(PROFILE)];
		const owners = indexKeyOwners(features, ['action:a-pay', 'rule:r-funds', 'state:session.role', 'rule:removed', 'criterion:c-pay']);
		expect(owners.orphans).toEqual(['rule:removed']);
		expect(owners.features).toEqual([
			{
				featureId: 'feat-cart',
				units: [
					{ unit: 'action:a-pay', keys: ['action:a-pay', 'event:cart.paid', 'rule:r-funds', 'rule:r-role', 'invariant:ai-1', 'transition:t-pay'] },
					{ unit: 'surface:s-cart', keys: ['surface:s-cart', 'state:cart.total', 'state:session.role', 'surface_rule:sr-1', 'surface_invariant:si-1'] }
				],
				alone: ['criterion:c-pay']
			},
			{ featureId: 'feat-profile', units: [{ unit: 'surface:s-profile', keys: ['surface:s-profile', 'state:session.role'] }], alone: [] }
		]);
	});

	it('places every key, a shared one in each feature that declares it', () => {
		const places = keyPlaces([featureIndexUnits(CART), featureIndexUnits(PROFILE)]);
		expect(places.get('state:session.role')).toEqual([
			{ featureId: 'feat-cart', unit: 'surface:s-cart' },
			{ featureId: 'feat-profile', unit: 'surface:s-profile' }
		]);
		expect(places.get('criterion:c-pay')).toEqual([{ featureId: 'feat-cart', unit: null }]);
		expect(places.get('rule:removed')).toBeUndefined();
	});

	it('reads a snapshot with nothing authored as a feature with no keys', () => {
		expect(featureIndexUnits({ id: 'feat-empty' })).toEqual({ featureId: 'feat-empty', units: [], alone: [] });
	});
});
