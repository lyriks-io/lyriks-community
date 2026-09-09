import { describe, it, expect, vi } from 'vitest';
import type { BehaviorBatchResult } from '$application/ports';
import { AuthorBehaviorUseCase } from './author-behavior';

const okBatch: BehaviorBatchResult = {
	ok: true,
	dryRun: false,
	appliedCount: 2,
	refs: { s1: 'srf-abc' },
	errors: [],
	maturityPercentage: 80,
	commitToken: null,
	raw: {}
};

describe('AuthorBehaviorUseCase', () => {
	it('forwards featureId + operations + dryRun to the advisor and returns the batch', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });

		const res = await uc.execute({ featureId: 'p__experience', operations: [{ kind: 'x' }], dryRun: true });

		expect(applyBehaviorBatch).toHaveBeenCalledWith('p__experience', [{ kind: 'x' }], {
			dryRun: true,
			commit: undefined,
			verbose: false
		});
		expect(res).toEqual({ available: true, batch: okBatch, warnings: [] });
	});

	it('reports unavailable (not a rejection) when the engine is unreachable', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(null);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({ featureId: 'f', operations: [] });
		expect(res).toEqual({ available: false, batch: null, warnings: [] });
	});

	it('surfaces a rejected batch as available with ok:false', async () => {
		const rejected: BehaviorBatchResult = {
			ok: false,
			dryRun: false,
			appliedCount: 0,
			refs: {},
			errors: ['op[0]: unknown op kind "nope"'],
			maturityPercentage: null,
			commitToken: null,
			raw: 'op[0]: unknown op kind "nope"'
		};
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch: vi.fn().mockResolvedValue(rejected) });
		const res = await uc.execute({ featureId: 'f', operations: [{ kind: 'nope' }] });
		expect(res.available).toBe(true);
		expect(res.batch?.ok).toBe(false);
		expect(res.batch?.errors[0]).toContain('unknown op kind');
	});

	it('defaults dryRun to false', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		await uc.execute({ featureId: 'f', operations: [] });
		expect(applyBehaviorBatch).toHaveBeenCalledWith('f', [], {
			dryRun: false,
			commit: undefined,
			verbose: false
		});
	});

	it('forwards a commit token so a dry-run can be saved without resending ops (Fix #8)', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		await uc.execute({ featureId: 'f', operations: [], commit: 'tok-123' });
		expect(applyBehaviorBatch).toHaveBeenCalledWith('f', [], {
			dryRun: false,
			commit: 'tok-123',
			verbose: false
		});
	});

	it('exposes the commitToken from a valid dry-run', async () => {
		const dry: BehaviorBatchResult = { ...okBatch, dryRun: true, commitToken: 'tok-abc' };
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch: vi.fn().mockResolvedValue(dry) });
		const res = await uc.execute({ featureId: 'f', operations: [{ kind: 'x' }], dryRun: true });
		expect(res.batch?.commitToken).toBe('tok-abc');
	});

	it('rejects a condition-less invariant op WITHOUT reaching the engine (store-poison guard)', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{ kind: 'add_surface_invariant', surfaceId: 's', name: 'X', description: 'words only' }
			]
		});
		expect(applyBehaviorBatch).not.toHaveBeenCalled(); // never written → cannot poison the store
		expect(res.available).toBe(true);
		expect(res.batch?.ok).toBe(false);
		expect(res.batch?.errors[0]).toContain('condition');
		expect(res.batch?.errors[0]).toContain('op[0]');
	});

	it('rejects the nested-invariant form too, and reports every offending op index', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{ kind: 'add_action', name: 'ok' },
				{ kind: 'add_action_invariant', invariant: { name: 'Y', description: 'no cond' } }
			]
		});
		expect(applyBehaviorBatch).not.toHaveBeenCalled();
		expect(res.batch?.errors).toHaveLength(1);
		expect(res.batch?.errors[0]).toContain('op[1]');
	});

	it('lets a well-formed invariant (with a condition) through to the engine', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{
					kind: 'add_surface_invariant',
					surfaceId: 's',
					invariant: {
						name: 'HasTitle',
						condition: { left: 'task.title', operator: '!=', right: '' },
						message: 'title required',
						description: 'a task always has a non-empty title'
					}
				}
			]
		});
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
		expect(res.batch?.ok).toBe(true);
	});

	it('rejects an action authored with no rule — nothing says when it may run', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [{ kind: 'add_action', ref: 'a1', surfaceId: 's', name: 'Delete invoice' }]
		});
		expect(applyBehaviorBatch).not.toHaveBeenCalled();
		expect(res.batch?.ok).toBe(false);
		expect(res.batch?.errors[0]).toContain('Delete invoice');
		expect(res.batch?.errors[0]).toContain('actionRef: "a1"');
	});

	it('accepts an action gated by an add_action_rule in the same batch', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{ kind: 'add_action', ref: 'a1', surfaceId: 's', name: 'Delete invoice' },
				{
					kind: 'add_action_rule',
					surfaceId: 's',
					actionRef: 'a1',
					rule: {
						category: 'permissions',
						condition: { left: 'user.role', operator: '==', right: 'admin' },
						effect: { type: 'block_action', reason: 'admins only', description: 'gate' },
						description: 'only an admin deletes an invoice'
					}
				}
			]
		});
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
		expect(res.batch?.ok).toBe(true);
	});

	it('accepts an unconditional action when it says so as an allow_action rule', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{ kind: 'add_action', ref: 'a1', surfaceId: 's', name: 'Open the landing page' },
				{
					kind: 'add_action_rule',
					surfaceId: 's',
					actionRef: 'a1',
					rule: {
						category: 'business',
						effect: { type: 'allow_action', description: 'always available' },
						description: 'unconditional by design'
					}
				}
			]
		});
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
		expect(res.batch?.ok).toBe(true);
	});

	it('rejects an action minted without a ref — no rule could target it', async () => {
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch: vi.fn() });
		const res = await uc.execute({
			featureId: 'f',
			operations: [{ kind: 'add_action', surfaceId: 's', name: 'Archive' }]
		});
		expect(res.batch?.ok).toBe(false);
		expect(res.batch?.errors[0]).toContain('Give the action a `ref`');
	});

	it('reports every ungated action, and only those', async () => {
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch: vi.fn() });
		const res = await uc.execute({
			featureId: 'f',
			operations: [
				{ kind: 'add_action', ref: 'a1', surfaceId: 's', name: 'Gated' },
				{ kind: 'add_action_rule', surfaceId: 's', actionRef: 'a1', rule: {} },
				{ kind: 'add_action', ref: 'a2', surfaceId: 's', name: 'Ungated' }
			]
		});
		expect(res.batch?.errors).toHaveLength(1);
		expect(res.batch?.errors[0]).toContain('Ungated');
	});

	it('leaves pre-existing rule-less actions alone — a batch that adds none passes', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		await uc.execute({
			featureId: 'f',
			operations: [{ kind: 'add_effect', surfaceId: 's', actionId: 'existing', effect: {} }]
		});
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
	});

	it('does not run the guard on a commit replay (already-validated batch)', async () => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		await uc.execute({
			featureId: 'f',
			operations: [{ kind: 'add_surface_invariant', description: 'no cond' }],
			commit: 'tok-1'
		});
		expect(applyBehaviorBatch).toHaveBeenCalledTimes(1);
	});
});
