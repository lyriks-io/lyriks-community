import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft } from '$domain/features';
import { createEmptyUsersDraft } from '$domain/users';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { indexFeatureRules } from '../specification/index-feature-rules';
import { indexFeatureActions } from '../specification/index-feature-actions';
import { featureView } from './features';

describe('Knowledge carries exact EARS identifiers to rule rows [criterion:7dc9e813]', () => {
	it('preserves full and shared-refusal spans with their original rule identities', () => {
		const snapshots = [{ featureId: 'f1', snapshot: { format: 'unspaghettit', version: 1, feature: { id: 'f1', name: 'Import', surfaces: [{ id: 's1', name: 'Import', actions: [{ id: 'a1', name: 'Import a project', rules: ['fromFile', 'fileHoldsKey'].map((name, i) => ({ id: `r${i}`, category: 'validation', condition: { left: { kind: 'param', name }, operator: 'is_false' }, effect: { type: 'block_action', reason: 'Choose a valid file.' } })) }] }] } } as unknown as UnspaFeatureSnapshot }];
		const before = JSON.stringify(snapshots);
		const model = featureView({ core: { id: 'c1', name: 'Projects', description: '', features: [{ id: 'f1', name: 'Import', description: '' }] }, featureId: 'f1', features: createEmptyFeaturesDraft('p1'), users: createEmptyUsersDraft('p1'), actions: indexFeatureActions(snapshots), rules: indexFeatureRules(null, snapshots) });
		expect(model.actions[0].refusalLead).not.toBeNull();
		expect(model.actions[0].rules.map((rule) => rule.id)).toEqual(['r0', 'r1']);
		for (const [index, rule] of model.actions[0].rules.entries()) {
			const identifier = ['fromFile', 'fileHoldsKey'][index];
			expect(rule.variables?.[0].identifiers).toEqual([identifier]);
			expect(rule.refusal?.variables?.[0].identifiers).toEqual([identifier]);
			expect(rule.refusal?.case.slice(rule.refusal.variables![0].start, rule.refusal.variables![0].end)).toBe(index ? 'file holds key' : 'from file');
		}
		expect(JSON.stringify(snapshots)).toBe(before);
	});
});
