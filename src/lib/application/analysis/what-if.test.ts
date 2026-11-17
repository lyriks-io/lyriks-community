import { describe, expect, it, vi } from 'vitest';
import { parseEvolutionDraft } from '../evolution/parse-evolution-draft';
import { exampleSteps, proofImpactHeadline, proofImpactLines, type DraftProofImpact } from '$lib/domain/evolution/proof-impact';
import { WhatIfUseCase, toDraftProofImpact } from './what-if';

// Criteria 3394334b and b64a6410: a change is compared before and after, nothing saved.

const comparison = {
	ok: true,
	persisted: false,
	proven: { before: true, after: true },
	statements: [{ id: 'inv', name: 'Stock never negative', before: 'none-within-bound', after: 'violated' }],
	actions: [],
	goals: [],
	findingsAppeared: [{ kind: 'reachable-violation', severity: 'critical', on: 'Stock never negative', detail: 'breaks' }],
	findingsResolved: [],
	branches: [],
	scenarios: [{ actionName: 'Take one', scenarioName: 'Takes the last one', before: 'pass', after: 'fail', reason: 'blocked' }],
	unchanged: false
};

describe('WhatIfUseCase', () => {
	it('compares a draft as its model would leave the feature, its ids replayed, on top of what is sent', async () => {
		const whatIf = vi.fn(async () => ({ kind: 'comparison' as const, comparison }));
		await new WhatIfUseCase({ whatIf }).execute({
			target: {
				kind: 'draft',
				draftId: 'draft:x',
				draftKind: 'amend',
				name: 'Stock',
				requestId: 'r',
				baseLeafId: 'feat-stock',
				model: { operations: [{ kind: 'remove_action_rule' }], mintedIds: ['m1'], updatedAt: '' },
				frozen: false
			} as never,
			operations: [{ kind: 'update_action' }],
			projectId: 'p'
		});
		expect(whatIf).toHaveBeenCalledWith(
			{
				featureId: 'feat-stock',
				operations: [{ kind: 'remove_action_rule' }, { kind: 'update_action' }],
				mintedIds: ['m1'],
				projectId: 'p'
			},
			expect.any(Object)
		);
	});

	it('compares an added feature with an empty one, and refuses a feature change with nothing to apply', async () => {
		const whatIf = vi.fn(async () => ({ kind: 'comparison' as const, comparison }));
		const useCase = new WhatIfUseCase({ whatIf });
		await useCase.execute({
			target: { kind: 'draft', draftId: 'draft:new', draftKind: 'add', name: 'New', requestId: 'r', baseLeafId: null, model: { operations: [{ kind: 'add_surface' }], mintedIds: [], updatedAt: '' }, frozen: false } as never,
			projectId: 'p'
		});
		expect(whatIf).toHaveBeenLastCalledWith(
			expect.objectContaining({ featureId: 'draft:new', blank: true }),
			expect.any(Object)
		);
		expect(await useCase.execute({ target: { kind: 'feature', featureId: 'feat-a' }, projectId: 'p' })).toEqual({
			kind: 'refused',
			error: 'send the operations of the change'
		});
	});
});

describe('the proof impact of a draft', () => {
	it('keeps the difference, and reads it in one line: what breaks first, then what it repairs', () => {
		const impact = toDraftProofImpact({ id: 'draft:x', name: 'Stock' }, { kind: 'comparison', comparison }, '2026-09-29T12:00:00Z');
		expect(impact.statements[0]).toEqual({ id: 'inv', name: 'Stock never negative', before: 'none-within-bound', after: 'violated' });
		expect(impact.scenarios[0]).toMatchObject({ before: 'pass', after: 'fail' });
		expect(proofImpactHeadline(impact)).toBe(
			'The change breaks "Stock never negative", stops scenario "Takes the last one".'
		);
	});

	it('says why a draft could not be compared, never "nothing changes"', () => {
		const down = toDraftProofImpact({ id: 'draft:x', name: 'Stock' }, null, 'at');
		expect(proofImpactHeadline(down)).toBe('Not compared: the behavior engine is unreachable.');
		const same = toDraftProofImpact({ id: 'draft:x', name: 'Stock' }, { kind: 'comparison', comparison: { ...comparison, statements: [], scenarios: [], findingsAppeared: [], unchanged: true } }, 'at');
		expect(proofImpactHeadline(same)).toBe('Nothing the solver proves changes.');
	});

	it('survives the evolution section being read back', () => {
		const impact = toDraftProofImpact({ id: 'draft:x', name: 'Stock' }, { kind: 'comparison', comparison }, 'at');
		const parsed = parseEvolutionDraft({ requests: [{ id: 'r1', title: 'x', proofImpact: [impact] }] }, 'p');
		expect(parsed.requests[0]?.proofImpact).toEqual([impact]);
	});
});

// Criterion d1b64667: how a change breaks a statement reads as an example anyone can follow.
describe('exampleSteps', () => {
	it('writes each action a person takes with the values used, in plain words, the channel left out', () => {
		expect(
			exampleSteps([
				{ actionName: 'Record payment', parameters: { amount: 100 } },
				{ actionName: 'Refund', parameters: { amount: 0.5, reason: 'goodwill', urgent: true, $channel: 'ui' } },
				{ actionName: 'Sign in', featureName: 'Accounts', parameters: {} }
			])
		).toEqual([
			'Someone does "Record payment", with amount 100',
			'Someone does "Refund", with amount 0.5, reason "goodwill", urgent yes',
			'Someone does "Sign in" (in Accounts)'
		]);
	});

	it('keeps the steps of a broken statement through the section read-back', () => {
		const withPath = {
			...comparison,
			findingsAppeared: [{ ...comparison.findingsAppeared[0], path: [{ actionName: 'Take one', parameters: { qty: 3 } }] }]
		};
		const impact = toDraftProofImpact({ id: 'draft:x', name: 'Stock' }, { kind: 'comparison', comparison: withPath }, 'at');
		const parsed = parseEvolutionDraft({ requests: [{ id: 'r1', title: 'x', proofImpact: [impact] }] }, 'p');
		expect(parsed.requests[0]?.proofImpact?.[0]?.findingsAppeared[0]?.path).toEqual([{ actionName: 'Take one', parameters: { qty: 3 } }]);
	});
});

// Criterion 0fb8f527: every line of what a change does to the proofs reads in plain words.
describe('proofImpactLines', () => {
	const base: DraftProofImpact = {
		draftId: 'd',
		draftName: 'Cart',
		ranAt: 'at',
		proven: { before: true, after: true },
		statements: [],
		actions: [],
		goals: [],
		findingsAppeared: [],
		findingsResolved: [],
		scenarios: [],
		unchanged: false
	};

	it('says what breaks with its example, and a scenario that moves without the engine status words', () => {
		const lines = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Never refund more than paid', before: 'none-within-bound', after: 'violated' }],
			findingsAppeared: [{ kind: 'reachable-violation', severity: 'critical', on: 'Never refund more than paid', detail: 'x', path: [{ actionName: 'Refund', parameters: { amount: 0.5 } }] }],
			scenarios: [{ actionName: 'Refund', scenarioName: 'A viewer cannot refund', before: 'pass', after: 'fail', reason: 'fail. status was success but expected blocked' }]
		});
		expect(lines).toEqual([
			{ tone: 'worse', text: '"Never refund more than paid" can now be broken.', example: ['Someone does "Refund", with amount 0.5'] },
			{ tone: 'worse', text: 'The example "A viewer cannot refund" (Refund) no longer holds: it now goes through where it should be refused.' }
		]);
	});

	it('shows how a repaired statement used to break', () => {
		const [line] = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Every line holds an item', before: 'violated', after: 'none-within-bound' }],
			findingsResolved: [{ kind: 'reachable-violation', severity: 'critical', on: 'Every line holds an item', detail: 'x', path: [{ actionName: 'Remove line', parameters: { qty: 1 } }] }]
		});
		expect(line).toEqual({
			tone: 'better',
			text: '"Every line holds an item" can no longer be broken. Before the change, it broke like this:',
			example: ['Someone does "Remove line", with qty 1']
		});
	});

	it('claims nothing about a check left unsettled on one side', () => {
		const lines = proofImpactLines({
			...base,
			statements: [{ id: 'i', name: 'Stock never negative', before: 'violated', after: 'unsettled' }],
			deadlocks: { before: 'found', after: 'unsettled' }
		});
		expect(lines.map((l) => l.tone)).toEqual(['open', 'open']);
		expect(lines[1]?.text).toBe('Dead ends could not be checked after the change, so nothing is said about them.');
		expect(proofImpactHeadline({ ...base, statements: [{ id: 'i', name: 'X', before: 'violated', after: 'unsettled' }] })).not.toContain('repairs');
	});
});
