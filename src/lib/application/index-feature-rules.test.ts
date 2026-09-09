import { describe, it, expect } from 'vitest';
import { indexFeatureRules } from './index-feature-rules';
import { experienceFeatureId } from './projection/aux-feature-ids';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

const projectSnap = (featureIds: string[], invariants: unknown[] = []): UnspaProjectSnapshot =>
	({
		format: 'unspaghettit-project',
		version: 1,
		project: {
			id: 'p1',
			name: 'P',
			description: '',
			tags: [],
			featureIds,
			createdAt: '',
			updatedAt: '',
			...(invariants.length ? { invariants } : {})
		}
	}) as unknown as UnspaProjectSnapshot;

const featureSnap = (feature: Record<string, unknown>): UnspaFeatureSnapshot => ({
	format: 'unspaghettit',
	version: 1,
	feature
});

describe('indexFeatureRules', () => {
	it('collects rules and invariants at action, surface and feature level', () => {
		const feature = featureSnap({
			id: 'f1',
			name: 'Checkout',
			featureInvariants: [{ id: 'fi1', name: 'Total is positive', message: 'Total must be > 0' }],
			surfaces: [
				{
					id: 's1',
					name: 'Cart',
					rules: [
						{ id: 'sr1', category: 'permissions', effect: { type: 'block_action' }, description: 'Signed-in only.' }
					],
					invariants: [{ id: 'si1', name: 'Status known', description: 'Status stays in enum.' }],
					actions: [
						{
							id: 'a1',
							name: 'Submit',
							rules: [
								{ id: 'ar1', category: 'validation', effect: { type: 'allow_action' }, description: 'Amount set.' }
							],
							invariants: [{ id: 'ai1', name: 'Left draft', description: 'Ends in draft.' }]
						}
					]
				}
			]
		});

		const model = indexFeatureRules(projectSnap(['f1']), [{ featureId: 'f1', snapshot: feature }]);

		expect(model.total).toBe(5);
		expect(model.groups).toHaveLength(1);
		const [group] = model.groups;
		expect(group.featureId).toBe('f1');
		expect(group.label).toBe('Checkout');

		const kinds = group.rules.map((r) => r.origin.kind).sort();
		expect(kinds).toEqual(['action', 'action', 'feature', 'surface', 'surface']);

		const actionRule = group.rules.find((r) => r.origin.kind === 'action' && r.kind === 'rule');
		expect(actionRule?.origin.actionName).toBe('Submit');
		expect(actionRule?.origin.surfaceName).toBe('Cart');
		expect(actionRule?.effect).toBe('allow');
		// Deep-link inputs the dashboard contract targets (?surface=&focus=rule:<id>).
		expect(actionRule?.origin.surfaceId).toBe('s1');
		expect(actionRule?.nodeId).toBe('ar1');
	});

	it('falls back to the effect prose, then the condition, and flags the row as missing', () => {
		const feature = featureSnap({
			id: 'f1',
			name: 'F',
			surfaces: [
				{
					id: 's1',
					name: 'S',
					actions: [
						{
							id: 'a1',
							name: 'Open',
							rules: [
								// no description — only the effect carries prose
								{ id: 'r1', effect: { type: 'block_action', reason: 'Sign in first.' } },
								// no prose anywhere — reads the condition aloud, flagged missing
								{ id: 'r2', effect: { type: 'block_action' }, condition: { left: 'user.authenticated', operator: 'is_false' } }
							]
						}
					]
				}
			]
		});

		const model = indexFeatureRules(projectSnap(['f1']), [{ featureId: 'f1', snapshot: feature }]);
		const rows = model.groups[0].rules;

		const withEffectProse = rows.find((r) => r.id.endsWith('r1'));
		expect(withEffectProse?.description).toBe('Sign in first.');
		expect(withEffectProse?.hasDescription).toBe(true);

		const conditionOnly = rows.find((r) => r.id.endsWith('r2'));
		expect(conditionOnly?.description).toBe('user.authenticated is false');
		expect(conditionOnly?.hasDescription).toBe(false);
		expect(model.missingDescription).toBe(1);
	});

	it('skips borrowed (mirrored) surfaces on leaves but keeps them on the Experience aux feature', () => {
		const projectId = 'proj';
		const auxId = experienceFeatureId(projectId);
		const journeySurface = {
			id: 'shared-surface',
			name: 'Landing',
			rules: [{ id: 'jr1', category: 'permissions', effect: { type: 'block_action' }, description: 'Auth.' }],
			actions: []
		};
		// The leaf borrows the same surface id via the Core-bridge mirror.
		const leaf = featureSnap({ id: 'leaf', name: 'Leaf', surfaces: [journeySurface] });
		const aux = featureSnap({ id: auxId, name: 'Experience', surfaces: [journeySurface] });

		const model = indexFeatureRules(projectSnap([auxId, 'leaf']), [
			{ featureId: auxId, snapshot: aux },
			{ featureId: 'leaf', snapshot: leaf }
		]);

		expect(model.groups.map((g) => g.featureId)).toEqual([auxId]);
		expect(model.groups[0].rules).toHaveLength(1);
		expect(model.total).toBe(1);
	});

	it('collects project-level invariants into their own project group', () => {
		const model = indexFeatureRules(
			projectSnap(['f1'], [{ id: 'pi1', name: 'Global', message: 'Always true.' }]),
			[{ featureId: 'f1', snapshot: featureSnap({ id: 'f1', name: 'F', surfaces: [] }) }]
		);
		const projectGroup = model.groups.find((g) => g.featureId === null);
		expect(projectGroup?.label).toBe('Project-wide');
		expect(projectGroup?.rules[0].origin.kind).toBe('project');
		expect(projectGroup?.rules[0].description).toBe('Always true.');
	});
});
