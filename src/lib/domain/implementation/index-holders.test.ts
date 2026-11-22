import { describe, expect, it } from 'vitest';
import { heldKeys, indexKeyHolders, type DraftIndexUnits } from './index';

/** A draft that amends the payment action with a rule and adds a criterion, and one that adds a whole surface. */
const DRAFTS: DraftIndexUnits[] = [
	{
		requestId: 'req-7',
		draftId: 'd-cart',
		units: [
			{ unit: 'action:a-pay', keys: ['action:a-pay', 'rule:r-funds', 'rule:r-held'] },
			{ unit: 'surface:s-cart', keys: ['surface:s-cart', 'state:cart.total'] }
		],
		adds: ['rule:r-held', 'criterion:ac-leaf-c9']
	},
	{
		requestId: 'req-8',
		draftId: 'd-refund',
		units: [{ unit: 'surface:s-refund', keys: ['surface:s-refund', 'state:refund.amount', 'state:session.role'] }],
		adds: ['surface:s-refund', 'state:refund.amount', 'state:session.role']
	}
];

describe('the keys an open request adds', () => {
	it('answers each with its request, its draft and the unit the draft places it in, with every key of that unit [criterion:a501859a]', () => {
		const rows = indexKeyHolders(DRAFTS, ['rule:r-held', 'criterion:ac-leaf-c9', 'state:session.role', 'rule:r-funds', 'rule:gone']);
		expect(rows).toEqual([
			// The official rule of the amended action travels in the unit, but the draft does not add it.
			{ requestId: 'req-7', draftId: 'd-cart', units: [{ unit: 'action:a-pay', keys: ['action:a-pay', 'rule:r-funds', 'rule:r-held'] }], alone: ['criterion:ac-leaf-c9'] },
			{ requestId: 'req-8', draftId: 'd-refund', units: [{ unit: 'surface:s-refund', keys: ['surface:s-refund', 'state:refund.amount', 'state:session.role'] }], alone: [] }
		]);
		// What leaves the orphans: the keys asked that a draft adds, never an official key its unit carries.
		expect([...heldKeys(DRAFTS, ['rule:r-held', 'criterion:ac-leaf-c9', 'state:session.role', 'rule:r-funds', 'rule:gone'])].sort()).toEqual([
			'criterion:ac-leaf-c9',
			'rule:r-held',
			'state:session.role'
		]);
	});

	it('answers nothing for keys no draft adds', () => {
		expect(indexKeyHolders(DRAFTS, ['rule:gone', 'state:cart.total'])).toEqual([]);
	});
});
