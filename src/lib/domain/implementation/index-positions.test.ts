import { describe, expect, it } from 'vitest';
import { featureIndexUnits, keyPlaces, locatedFeature, planPositions } from './index';

const FEATURE = {
	id: 'feat-cart',
	acceptanceCriteria: [{ id: 'c-pay' }],
	entities: [{ id: 'e-order' }],
	surfaces: [
		{
			id: 's-cart',
			stateDefinitions: [{ id: 'st-total', path: 'cart.total' }, { id: 'st-role', path: 'session.role' }],
			rules: [],
			invariants: [],
			transitions: [],
			actions: [{ id: 'a-pay', emittedEvents: ['cart.paid'], rules: [{ id: 'r-funds' }, { id: 'r-role' }, { id: 'r-new' }], invariants: [], transitions: [] }]
		}
	]
};
const OTHER = {
	id: 'feat-profile',
	surfaces: [{ id: 's-profile', stateDefinitions: [{ id: 'st-role-2', path: 'session.role' }, { id: 'st-name', path: 'profile.name' }], rules: [], invariants: [], transitions: [], actions: [] }]
};

const at = (line: number, snippet = `line ${line}`) => [{ file: 'src/pay.ts', line, snippet }];
/** What the engine's status of the feature answers after a sync. */
const STATUS = {
	actions: [
		{
			actionId: 'a-pay',
			foundEntities: [
				{ entityType: 'action', entityId: 'a-pay', locations: at(10) },
				{ entityType: 'event', entityId: 'cart.paid', locations: at(14) },
				{ entityType: 'rule', entityId: 'r-funds', locations: at(20) },
				// A place claimed without its code line stays a claim.
				{ entityType: 'rule', entityId: 'r-role', locations: [{ file: 'src/pay.ts', line: 30, unverified: true }] }
			],
			auditMeta: { auditedAt: '2026-11-19T00:00:00.000Z', verifiedAt: '2026-11-19T01:00:00.000Z', specVersion: 'v1' }
		}
	],
	surfaces: [{ surfaceId: 's-cart', foundEntities: [{ entityType: 'state', entityId: 'st-total', locations: at(5) }], auditMeta: { auditedAt: 'x' } }],
	criteria: [
		{ criterionId: 'c-pay', key: 'criterion:c-pay', indexed: true, verification: { kind: 'unit', lastResult: { passed: true, at: 'y' } }, specVersion: 'v1' }
	]
};

const plan = (sent: Record<string, unknown>, statuses: Record<string, unknown> = { 'feat-cart': STATUS }) => {
	const units = [featureIndexUnits(FEATURE), featureIndexUnits(OTHER)];
	const unitKeys = new Map(units.flatMap((f) => f.units.map((u) => [u.unit, u.keys] as const)));
	const located = new Map(
		Object.entries(statuses).map(([id, status]) => [id, locatedFeature(id === 'feat-cart' ? FEATURE : OTHER, status as Record<string, unknown>)])
	);
	return planPositions(sent, keyPlaces(units), unitKeys, located);
};

describe('moving located lines without their unit', () => {
	it('lands each touched report again with exactly what it located, the moved places replaced and its proof kept [criterion:e9699cc6]', () => {
		const result = plan({ 'rule:r-funds': { status: 'implemented', file: 'src/pay.ts', line: 24, signature: 'if (funds < total) throw' } });
		expect(result.moved).toEqual(['rule:r-funds']);
		expect(result.notLocated).toEqual([]);
		expect(result.orphans).toEqual([]);
		expect(result.units).toEqual(['action:a-pay']);
		expect(result.batches).toEqual([
			{
				'action:a-pay': { auditedAt: '2026-11-19T00:00:00.000Z', verifiedAt: '2026-11-19T01:00:00.000Z', specVersion: 'v1', status: 'implemented', file: 'src/pay.ts', line: 10, signature: 'line 10' },
				'event:cart.paid': { status: 'implemented', file: 'src/pay.ts', line: 14, signature: 'line 14' },
				'rule:r-funds': { status: 'implemented', file: 'src/pay.ts', line: 24, signature: 'if (funds < total) throw' },
				// No code line reached the server for it: it is sent without one, a claim as before.
				'rule:r-role': { status: 'implemented', file: 'src/pay.ts', line: 30 }
			}
		]);
		// The rule never located stays out: the report gains no key.
		expect(result.batches[0]['rule:r-new']).toBeUndefined();
	});

	it('lists a key not located yet and an orphan, and lands nothing for them [criterion:e9699cc6]', () => {
		const result = plan({ 'rule:r-new': { file: 'src/pay.ts', line: 40 }, 'rule:gone': { file: 'src/pay.ts', line: 41 }, 'entity:e-order': { file: 'src/order.ts', line: 1 } });
		expect(result.moved).toEqual([]);
		// An entity is a key no report keeps: Lyriks holds no place to move for it.
		expect(result.notLocated).toEqual(['rule:r-new', 'entity:e-order']);
		expect(result.orphans).toEqual(['rule:gone']);
		expect(result.batches).toEqual([]);
	});

	it('moves a state by its path although the report names it by the id of its definition, and a criterion with what verifies it', () => {
		const result = plan({
			'state:cart.total': { file: 'src/cart.ts', line: 7, signature: 'total: number' },
			'criterion:c-pay': { status: 'implemented', file: 'src/pay.test.ts', line: 3, signature: "it('pays')", verification: { kind: 'e2e' } }
		});
		expect(result.moved).toEqual(['state:cart.total', 'criterion:c-pay']);
		expect(result.units).toEqual(['surface:s-cart', 'criterion:c-pay']);
		expect(result.batches[0]).toEqual({
			'state:cart.total': { status: 'implemented', file: 'src/cart.ts', line: 7, signature: 'total: number' },
			'surface:s-cart': { auditedAt: 'x', status: 'implemented' },
			// The place moves; what verifies it stays the recorded one.
			'criterion:c-pay': { status: 'implemented', file: 'src/pay.test.ts', line: 3, signature: "it('pays')", verification: { kind: 'unit', lastResult: { passed: true, at: 'y' } }, specVersion: 'v1' }
		});
	});

	it('lands in separate batches two reports a flat index would mix, so neither gains a key it did not locate', () => {
		const statuses = {
			'feat-cart': {
				...STATUS,
				surfaces: [{ surfaceId: 's-cart', foundEntities: [{ entityType: 'state', entityId: 'st-role', locations: at(2) }], auditMeta: {} }]
			},
			// The other surface declares session.role too but never located it.
			'feat-profile': { surfaces: [{ surfaceId: 's-profile', foundEntities: [{ entityType: 'state', entityId: 'st-name', locations: at(8) }], auditMeta: {} }] }
		};
		const result = plan({ 'state:session.role': { file: 'src/session.ts', line: 3, signature: 'role' }, 'state:profile.name': { file: 'src/profile.ts', line: 9, signature: 'name' } }, statuses);
		expect(result.moved).toEqual(['state:session.role', 'state:profile.name']);
		expect(result.batches).toHaveLength(2);
		const withProfile = result.batches.find((batch) => 'surface:s-profile' in batch)!;
		expect(withProfile['state:session.role']).toBeUndefined();
	});
});
