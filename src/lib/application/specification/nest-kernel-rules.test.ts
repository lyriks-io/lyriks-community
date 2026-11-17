import { describe, expect, it } from 'vitest';
import { indexFeatureRules } from './index-feature-rules';
import { nestKernelRules } from './nest-kernel-rules';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

const project = {
	format: 'unspaghettit-project',
	version: 1,
	project: { featureIds: ['dive'] }
};
const refuse = (
	id: string,
	left: string,
	right: unknown,
	reason: string,
	category = 'business'
) => ({
	id,
	category,
	condition: { left, operator: 'equals', right },
	effect: { type: 'block_action', reason }
});

const diving = {
	format: 'unspaghettit',
	version: 1,
	feature: {
		id: 'dive',
		name: 'Diving',
		featureInvariants: [
			{
				id: 'fi',
				name: 'Depth is known',
				condition: { left: 'dive.depth', operator: 'exists' }
			}
		],
		surfaces: [
			{
				id: 's-dive',
				name: 'Breath And Diving',
				invariants: [
					{
						id: 'si',
						name: 'Breath fits in the lungs',
						condition: {
							left: 'dive.breath',
							operator: 'greater_or_equal',
							right: 0
						}
					}
				],
				actions: [
					{
						id: 'a-down',
						name: 'Dive Down',
						rules: [
							refuse('r1', 'dive.status', 'out_of_breath', 'Out of breath: you can only go up.'),
							refuse('r2', 'dive.status', 'blackout', 'You have blacked out.')
						]
					},
					{
						id: 'a-rise',
						name: 'Rise',
						rules: [refuse('r3', 'dive.depth', 0, 'Already at the surface.', 'validation')]
					}
				]
			},
			{
				id: 's-gear',
				name: 'Dive Gear',
				actions: [
					{
						id: 'a-buy',
						name: 'Buy Dive Gear',
						rules: [refuse('r4', 'gear.owned', true, 'You already own this.')]
					}
				]
			}
		]
	}
};

const rulesOfDiving = () =>
	indexFeatureRules(project as unknown as UnspaProjectSnapshot, [
		{ featureId: 'dive', snapshot: diving as unknown as UnspaFeatureSnapshot }
	]).groups[0]!.rules;

describe('nestKernelRules', () => {
	it('arranges a feature by surface, then by action, with the surface statements after its actions', () => {
		const placed = nestKernelRules(rulesOfDiving());
		expect(placed.surfaces.map((s) => [s.surfaceName, s.count])).toEqual([
			['Breath And Diving', 4],
			['Dive Gear', 1]
		]);
		const [breath] = placed.surfaces;
		expect(breath!.actions.map((a) => [a.actionName, a.rules.length])).toEqual([
			['Dive Down', 2],
			['Rise', 1]
		]);
		expect(breath!.own.map((r) => r.title)).toEqual(['Breath fits in the lungs']);
		expect(placed.featureWide.map((r) => r.title)).toEqual(['Depth is known']);
	});

	it('reads an action refused under several conditions as one sentence, one line per condition', () => {
		const [breath] = nestKernelRules(rulesOfDiving()).surfaces;
		const [down, rise] = breath!.actions;
		expect(down!.refusalLead).toBe(
			'When the user asks to dive down, the system shall refuse to dive down if any of these holds:'
		);
		expect(down!.rules.map((r) => [r.refusal?.case, r.refusal?.message])).toEqual([
			['the dive status is "out_of_breath"', 'Out of breath: you can only go up.'],
			['the dive status is "blackout"', 'You have blacked out.']
		]);
		// A single refusal keeps its own whole sentence.
		expect(rise!.refusalLead).toBeNull();
	});

	it('keeps the shape on a filtered subset', () => {
		const only = rulesOfDiving().filter((r) => r.nodeId === 'r2');
		const placed = nestKernelRules(only);
		expect(placed.surfaces).toHaveLength(1);
		expect(placed.surfaces[0]!.actions[0]!.refusalLead).toBeNull();
	});

	it('names the states each rule reads and a readable category', () => {
		const rules = rulesOfDiving();
		expect(rules.find((r) => r.nodeId === 'r1')?.reads).toEqual(['dive.status']);
		expect(rules.find((r) => r.nodeId === 'si')?.reads).toEqual(['dive.breath']);
		expect(rules.find((r) => r.nodeId === 'r3')?.title).toBe('Validation');
	});
});
