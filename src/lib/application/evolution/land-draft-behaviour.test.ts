import { describe, expect, it, vi } from 'vitest';
import { AuthorBehaviorUseCase } from '$application/specification/author-behavior';
import { landDraftBehaviour } from './land-draft-behaviour';

const saved = (appliedCount: number) => ({ ok: true, dryRun: false, appliedCount, refs: {}, errors: [], maturityPercentage: null, commitToken: null, raw: {} });
const deletion = { kind: 'remove_state_definition', surfaceId: 's1', stateDefinitionId: 'st-old' };

/**
 * A model drafted in an Evolution request detaches a state, removes it and
 * goes on (EVO-015 on feat-7, 2026-11-22: its landing sent the deletion inside
 * the batch and the write path refused the whole model). The ordinary write
 * path is used as it is, so its guard is the one the landing meets.
 */
describe('landDraftBehaviour', () => {
	const operations = [
		{ kind: 'remove_action_rule', ruleId: 'r-old' },
		deletion,
		{ kind: 'add_state_definition', surfaceId: 's1', path: 'peer.question', type: 'string' },
		{ kind: 'add_scenario', surfaceId: 's1', name: 'Asks another AI' }
	];

	it('lands a model that removes a state: the other operations first with their ids, then the deletion alone through the checked deletion', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(saved(3));
		const deleteState = { execute: vi.fn().mockResolvedValue({ ok: true, code: 'DELETED', message: 'State deleted.', formalChecked: false }) };
		const author = new AuthorBehaviorUseCase({ applyBehaviorBatch }, deleteState);

		const landed = await landDraftBehaviour(author, { projectId: 'p', featureId: 'feat-7', operations, mintedIds: ['m1', 'm2'] });

		expect(landed).toEqual({ ok: true });
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
		const [featureId, sent, opts] = applyBehaviorBatch.mock.calls[0];
		expect(featureId).toBe('feat-7');
		expect(sent).toEqual([operations[0], operations[2], operations[3]]);
		expect(opts).toMatchObject({ mintedIds: ['m1', 'm2'] });
		expect(deleteState.execute).toHaveBeenCalledWith({ projectId: 'p', featureId: 'feat-7', surfaceId: 's1', stateDefinitionId: 'st-old', dryRun: undefined });
		expect(applyBehaviorBatch.mock.invocationCallOrder[0]).toBeLessThan(deleteState.execute.mock.invocationCallOrder[0]);
	});

	it('says why a deletion the check refuses did not land', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(saved(3));
		const deleteState = { execute: vi.fn().mockResolvedValue({ ok: false, code: 'GLUING_CONDITION', message: 'Still referenced.', formalChecked: true }) };

		const landed = await landDraftBehaviour(new AuthorBehaviorUseCase({ applyBehaviorBatch }, deleteState), {
			projectId: 'p',
			featureId: 'feat-7',
			operations,
			mintedIds: []
		});

		expect(landed).toEqual({ ok: false, errors: ['Still referenced.'] });
	});

	it('never deletes a state when the rest of the model was refused', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue({ ...saved(0), ok: false, errors: ['op[1] refused'] });
		const deleteState = { execute: vi.fn() };

		const landed = await landDraftBehaviour(new AuthorBehaviorUseCase({ applyBehaviorBatch }, deleteState), {
			projectId: 'p',
			featureId: 'feat-7',
			operations,
			mintedIds: []
		});

		expect(landed).toEqual({ ok: false, errors: ['op[1] refused'] });
		expect(deleteState.execute).not.toHaveBeenCalled();
	});

	it('sends a model without a deletion as one batch, as before', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(saved(2));
		const deleteState = { execute: vi.fn() };
		const plain = [operations[2], operations[3]];

		const landed = await landDraftBehaviour(new AuthorBehaviorUseCase({ applyBehaviorBatch }, deleteState), {
			projectId: 'p',
			featureId: 'feat-7',
			operations: plain,
			mintedIds: ['m1']
		});

		expect(landed).toEqual({ ok: true });
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
		expect(applyBehaviorBatch.mock.calls[0][1]).toEqual(plain);
		expect(deleteState.execute).not.toHaveBeenCalled();
	});
});
