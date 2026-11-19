import { describe, expect, it, vi } from 'vitest';
import type { DraftLeaf, EvolutionRequest } from '$domain/evolution';
import { resolveWalkTarget, SimulateBehaviorUseCase, type WalkTarget } from './simulate-behavior';

const draft = (
	id: string,
	kind: DraftLeaf['kind'],
	baseLeafId: string | null,
	extra: Partial<DraftLeaf> = {}
): DraftLeaf => ({ id, kind, baseLeafId, name: id, ...extra }) as unknown as DraftLeaf;

const model = {
	operations: [{ kind: 'add_surface', ref: 's', name: 'S', type: 'screen', description: 'x' }],
	mintedIds: ['aaaa1111'],
	updatedAt: '2026-09-25T10:00:00.000Z'
};

const evolution = {
	requests: [
		{
			id: 'req-1',
			frozen: false,
			drafts: [
				draft('draft:amend', 'amend', 'feat-cart'),
				draft('draft:new', 'add', null),
				draft('draft:modelled', 'add', null, { behaviourModel: model })
			]
		} as unknown as EvolutionRequest,
		{
			id: 'req-2',
			frozen: true,
			drafts: [draft('draft:frozen', 'amend', 'feat-cart')]
		} as unknown as EvolutionRequest
	]
};

describe('resolveWalkTarget', () => {
	it('walks a stored feature as it is', () => {
		expect(resolveWalkTarget('feat-cart', evolution, false)).toEqual({
			ok: true,
			target: { kind: 'feature', featureId: 'feat-cart' }
		});
	});

	it('walks an amendment over the feature it stands for, and says when the request is frozen', () => {
		const amend = resolveWalkTarget('draft:amend', evolution, false);
		expect(amend.ok && amend.target).toMatchObject({
			kind: 'draft',
			baseLeafId: 'feat-cart',
			frozen: false
		});
		const frozen = resolveWalkTarget('draft:frozen', evolution, false);
		expect(frozen.ok && frozen.target).toMatchObject({ requestId: 'req-2', frozen: true });
	});

	it('refuses an addition with neither a model nor operations, and accepts one that has either', () => {
		const refused = resolveWalkTarget('draft:new', evolution, false);
		expect(refused.ok === false && refused.status).toBe(400);
		expect(refused.ok === false && refused.message).toContain('apply_behavior_batch');
		expect(resolveWalkTarget('draft:new', evolution, true).ok).toBe(true);
		const modelled = resolveWalkTarget('draft:modelled', evolution, false);
		expect(modelled.ok && modelled.target).toMatchObject({ model });
	});

	it('answers 404 for a draft no request carries', () => {
		const missing = resolveWalkTarget('draft:gone', evolution, true);
		expect(missing.ok === false && missing.status).toBe(404);
	});
});

describe('SimulateBehaviorUseCase', () => {
	const steps = [{ actionId: 'a1' }];
	const modelled: WalkTarget = {
		kind: 'draft',
		draftId: 'draft:modelled',
		draftKind: 'add',
		name: 'Modelled',
		requestId: 'r',
		baseLeafId: null,
		model,
		frozen: false
	};
	const sentBy = async (run: (useCase: SimulateBehaviorUseCase) => Promise<unknown>) => {
		const simulateSteps = vi.fn().mockResolvedValue({ kind: 'walk', walk: { ok: true } });
		await run(new SimulateBehaviorUseCase({ simulateSteps }));
		return simulateSteps.mock.calls[0][0];
	};

	it('simulates a stored feature as it is', async () => {
		const sent = await sentBy((u) =>
			u.execute({ target: { kind: 'feature', featureId: 'feat-cart' }, args: { steps } })
		);
		expect(sent).toMatchObject({ featureId: 'feat-cart', steps });
		expect(sent.blank).toBeUndefined();
	});

	it('replays a draft model with its ids, then the call operations reported as the new ones', async () => {
		const extra = [{ kind: 'add_action', ref: 'x' }];
		const sent = await sentBy((u) =>
			u.execute({ target: modelled, args: { steps, operations: extra } })
		);
		expect(sent).toMatchObject({
			featureId: 'draft:modelled',
			blank: true,
			operations: [...model.operations, ...extra],
			mintedIds: model.mintedIds,
			newOperationsFrom: 1
		});
	});

	it('replays the call operations alone when they replace the model, keeping its ids slot for slot', async () => {
		const replacement = [{ kind: 'add_surface', ref: 't' }];
		const sent = await sentBy((u) =>
			u.execute({ target: modelled, args: { operations: replacement }, operationsMode: 'instead' })
		);
		expect(sent).toMatchObject({
			operations: replacement,
			mintedIds: model.mintedIds,
			newOperationsFrom: 0
		});
	});

	it('simulates an amendment over the feature it stands for', async () => {
		const sent = await sentBy((u) =>
			u.execute({
				target: {
					kind: 'draft',
					draftId: 'draft:amend',
					draftKind: 'amend',
					name: 'Amend',
					requestId: 'r',
					baseLeafId: 'feat-cart',
					frozen: false
				},
				args: { runScenarios: true }
			})
		);
		expect(sent).toMatchObject({ featureId: 'feat-cart', runScenarios: true, operations: [] });
		expect(sent.blank).toBeUndefined();
	});
});

describe('SimulateBehaviorUseCase.draftFeatureWalk', () => {
	it('asks the engine for the computed feature and nothing else, and hands back its verdict and feature', async () => {
		const simulateSteps = vi.fn().mockResolvedValue({
			kind: 'walk',
			walk: { ok: true, persisted: false, featureId: 'draft:modelled', feature: { id: 'draft:modelled' }, batch: { created: [] } }
		});
		const target = { kind: 'draft', draftId: 'draft:modelled', draftKind: 'add', name: 'Modelled', requestId: 'r', baseLeafId: null, model, frozen: false } as const;
		const answer = await new SimulateBehaviorUseCase({ simulateSteps }).draftFeatureWalk('p', target);
		expect(simulateSteps.mock.calls[0][0]).toMatchObject({ featureId: 'draft:modelled', blank: true, includeFeature: true });
		expect(simulateSteps.mock.calls[0][0].steps).toBeUndefined();
		expect(answer).toEqual({ kind: 'walk', walk: { ok: true, persisted: false, featureId: 'draft:modelled', feature: { id: 'draft:modelled' } } });
	});
});
