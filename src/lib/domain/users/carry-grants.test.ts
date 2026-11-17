import { describe, expect, it } from 'vitest';
import { carryGrantsToRows } from './carry-grants';
import { actionCapabilityId, featureOfActionCapability, permissionCoverage, createEmptyUsersDraft, type PermissionGrant } from './draft';

const pay = actionCapabilityId('feat-checkout', 'act-pay');
const refund = actionCapabilityId('feat-checkout', 'act-refund');
const rows = [
	{ id: pay, source: 'feature' as const, featureId: 'feat-checkout' },
	{ id: refund, source: 'feature' as const, featureId: 'feat-checkout' },
	{ id: 'screen:cart', source: 'surface' as const }
];
/** A grant as it was stored before 2026-11-02: with a verb. */
const legacy = (capabilityId: string, action: string, capabilitySource: PermissionGrant['capabilitySource'] = 'feature') =>
	({ roleId: 'buyer', capabilityId, capabilitySource, action }) as PermissionGrant;

describe('grants made before the matrix was per action [criterion:e81345e6]', () => {
	it('carry a whole-feature grant onto every action of that feature, as one access each', () => {
		const carried = carryGrantsToRows([legacy('feat-checkout', 'read'), legacy('feat-checkout', 'update')], rows);
		expect(carried).toEqual([
			{ roleId: 'buyer', capabilityId: pay, capabilitySource: 'feature' },
			{ roleId: 'buyer', capabilityId: refund, capabilitySource: 'feature' }
		]);
	});

	it('fold the verbs one role held on one row into one access', () => {
		expect(carryGrantsToRows([legacy('screen:cart', 'view', 'surface'), legacy('screen:cart', 'read', 'surface')], rows)).toEqual([
			{ roleId: 'buyer', capabilityId: 'screen:cart', capabilitySource: 'surface' }
		]);
	});

	it('leave grants on rows that do not exist to the save, which names what it drops', () => {
		const dead = { roleId: 'buyer', capabilityId: 'gone', capabilitySource: 'feature' as const };
		expect(carryGrantsToRows([dead], rows)).toEqual([dead]);
	});

	it('are carried once: carrying again changes nothing', () => {
		const once = carryGrantsToRows([legacy('feat-checkout', 'read')], rows);
		expect(carryGrantsToRows(once, rows)).toEqual(once);
	});
});

describe('a feature granted through its actions', () => {
	it('reads the feature back from the action row id', () => {
		expect(featureOfActionCapability(pay)).toBe('feat-checkout');
		expect(featureOfActionCapability('screen:cart')).toBeNull();
	});

	it('counts as granted when any of its actions is', () => {
		const draft = {
			...createEmptyUsersDraft('p'),
			roles: [{ id: 'buyer', name: 'Buyer', description: '', userCountMin: 1, userCountMax: null, tone: 'customer' as const, sourceIds: [] }],
			permissions: [{ roleId: 'buyer', capabilityId: refund, capabilitySource: 'feature' as const }]
		};
		expect(permissionCoverage(draft, ['feat-checkout']).uncoveredCapabilityIds).toEqual([]);
	});
});
