import { describe, expect, it } from 'vitest';
import { createDraftLeaf, createEvolutionRequest } from './draft';
import { awaitingChoiceNote, touchedElementsOf, touchedReading, type KnowledgeStanding } from './touched-validation';

/**
 * What a change touches, as elements of Knowledge (EVO-003): what its drafts
 * amend or remove, read off their behaviour model, and what its diagrams build on.
 */

const F = 'feat-cart';
const base = createEvolutionRequest({ id: 'r' });
const request = {
	...base,
	drafts: [
		createDraftLeaf({
			kind: 'amend',
			baseLeafId: F,
			behaviourModel: {
				operations: [
					{ kind: 'update_action', actionId: 'a1' },
					{ kind: 'add_action_rule', actionId: 'a2', rule: {} },
					{ kind: 'update_action_rule', actionId: 'a3', ruleId: 'r3' },
					{ kind: 'remove_action', actionId: 'a4' },
					{ kind: 'add_action', ref: 'new' }
				],
				mintedIds: [],
				updatedAt: 't'
			}
		}),
		createDraftLeaf({ kind: 'remove', baseLeafId: 'feat-old' })
	],
	stepAnswers: { ...base.stepAnswers, functional_spec: { ...base.stepAnswers.functional_spec, diagram: 'actor Buyer\nuse case Pay: Buyer @[Payments](feature:feat-pay)\nflow Pay\nBuyer: pays @[Pay](action:feat-pay/p1)' } }
};

describe('the elements a change touches', () => {
	it('reads the amended feature and each existing action or rule its model changes, and what its diagrams link to', () => {
		const touched = touchedElementsOf(request);
		expect([...touched.touched]).toEqual([
			[`feature:${F}`, 'amended'],
			[`action:${F}:a1`, 'amended'],
			[`action:${F}:a2`, 'amended'],
			[`rule:${F}:r3`, 'amended'],
			[`action:${F}:a3`, 'amended'],
			['feature:feat-pay', 'used'],
			['action:feat-pay:p1', 'used']
		]);
		expect([...touched.removed]).toEqual([`action:${F}:a4`]);
		expect([...touched.removedFeatures]).toEqual(['feat-old']);
	});

	it('lists what Knowledge reads not validated, in its order, and leaves out what leaves the specification', () => {
		const standing = (id: string, over: Partial<KnowledgeStanding> = {}): KnowledgeStanding => ({ id, title: id, validated: false, waitsOn: [], waitsOnMe: true, ...over });
		const reading = touchedReading(request, {
			readable: true,
			specValidated: false,
			elements: [standing(`feature:${F}`, { validated: true }), standing(`action:${F}:a4`), standing(`rule:${F}:r4`, { under: `action:${F}:a4` }), standing('feature:feat-old'), standing('action:feat-pay:p1')]
		});
		expect(reading.lines.map((l) => l.id)).toEqual(['action:feat-pay:p1']);
		expect(reading.validated).toEqual([`feature:${F}`]);
		expect(reading.awaitingChoice).toBe(1);
	});

	it('says how many still wait for a choice, and nothing when none does', () => {
		expect(awaitingChoiceNote(1)).toBe('1 element this change touches still waits for a validation choice: the freeze sets it to Validate at the landing.');
		expect(awaitingChoiceNote(0)).toBeNull();
	});
});
