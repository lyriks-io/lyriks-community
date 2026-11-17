import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { featureActionCapabilities } from './action-capabilities';

const snapshot = (surfaces: unknown) => ({ feature: { surfaces } }) as unknown as UnspaFeatureSnapshot;

describe('feature rows of the permissions matrix', () => {
	it('are the actions the feature declares, grouped under it and its Core', () => {
		const rows = featureActionCapabilities([
			{
				id: 'feat-checkout',
				name: 'Checkout',
				coreId: 'core-buy',
				coreName: 'Buy',
				snapshot: snapshot([{ id: 's1', actions: [{ id: 'a1', name: 'Pay' }, { id: 'a2', name: 'Refund' }] }])
			}
		]);
		expect(rows.map((r) => [r.id, r.label, r.featureId, r.featureLabel, r.sourceRefId])).toEqual([
			['action:feat-checkout:a1', 'Pay', 'feat-checkout', 'Checkout', 'core-buy'],
			['action:feat-checkout:a2', 'Refund', 'feat-checkout', 'Checkout', 'core-buy']
		]);
	});

	it('keep one row for a feature that declares no action yet', () => {
		const rows = featureActionCapabilities([
			{ id: 'feat-empty', name: 'Wishlist', coreId: 'core-buy', coreName: 'Buy', snapshot: null }
		]);
		expect(rows).toEqual([
			expect.objectContaining({ id: 'feat-empty', label: 'Wishlist', source: 'feature', featureLabel: 'Wishlist' })
		]);
		expect(rows[0].featureId).toBeUndefined();
	});
});
