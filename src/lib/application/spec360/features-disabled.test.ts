import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft } from '$domain/users';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { indexFeatureRules } from '../specification/index-feature-rules';
import { indexDisabledFeatures, indexFeatureActions } from '../specification/index-feature-actions';
import { featureView } from './features';

const marker = { by: 'Sam Rivera', at: '2026-11-18T10:00:00.000Z', reason: 'Put aside while the import is reworked' };
const snapshots = (disabled: boolean) => [
	{
		featureId: 'f1',
		snapshot: {
			format: 'unspaghettit',
			version: 1,
			feature: {
				id: 'f1',
				name: 'Import',
				...(disabled ? { disabled: marker } : {}),
				surfaces: [{ id: 's1', name: 'Import', actions: [{ id: 'a1', name: 'Import a project', rules: [{ id: 'r1', category: 'validation', effect: { type: 'allow_action' } }] }] }]
			}
		} as unknown as UnspaFeatureSnapshot
	}
];
const view = (disabled: boolean) => {
	const read = snapshots(disabled);
	return featureView({
		core: { id: 'c1', name: 'Projects', description: '', features: [{ id: 'f1', name: 'Import', description: '' }] },
		featureId: 'f1',
		features: createEmptyFeaturesDraft('p1'),
		users: createEmptyUsersDraft('p1'),
		actions: indexFeatureActions(read),
		rules: indexFeatureRules(null, read),
		disabledFeatures: indexDisabledFeatures(read)
	});
};

describe('a feature disabled as a whole, on its page', () => {
	it('reads its marker in its head, and every action and rule it holds disabled with it [criterion:ac-leaf-c4071631-a445-435c-af46-f09907138a5e] [criterion:ac-leaf-5ecaa85c-e299-4cd7-80a1-915322d07355]', () => {
		const page = view(true);
		expect(page.disabled).toEqual(marker);
		expect(page.actions[0]?.disabled).toEqual(marker);
		expect(page.actions[0]?.rules[0]?.disabled).toEqual(marker);
	});

	it('reads nothing disabled while it is in force', () => {
		const page = view(false);
		expect(page.disabled).toBeUndefined();
		expect(page.actions[0]?.disabled).toBeUndefined();
		expect(indexDisabledFeatures(snapshots(false))).toEqual({});
	});
});
