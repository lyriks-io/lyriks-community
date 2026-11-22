import { describe, it, expect, vi } from 'vitest';
import type { BehaviorBatchResult, UnspaghettitAdvisorPort } from '$application/ports';
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
	it.each([true, false])('rejects incomplete operands without writing (dryRun=%s)', async (dryRun) => {
		const applyBehaviorBatch = vi.fn().mockResolvedValue(okBatch);
		const uc = new AuthorBehaviorUseCase({ applyBehaviorBatch });
		const res = await uc.execute({ featureId: 'f', dryRun, operations: [
			{ kind: 'add_effect', effect: { type: 'set_state', path: 'total', value: { kind: 'count', path: 'records' } } }
		] });
		expect(applyBehaviorBatch).not.toHaveBeenCalled();
		expect(res.batch?.ok).toBe(false);
		expect(res.batch?.errors.join(' ')).toContain('operand');
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

type BatchOptions = NonNullable<Parameters<UnspaghettitAdvisorPort['applyBehaviorBatch']>[2]>;

/**
 * A behavior engine held in memory: it writes a batch unless asked for a dry
 * run, keeps a dry run under a commit token, moves the feature to a new version
 * at each write and refuses a batch written against an older one. An engine
 * that predates versions refuses any argument it does not know.
 */
class Engine implements Pick<UnspaghettitAdvisorPort, 'applyBehaviorBatch'> {
	readonly written: (readonly Record<string, unknown>[])[] = [];
	version = 'v1';
	private readonly dryRuns = new Map<string, readonly Record<string, unknown>[]>();
	constructor(private readonly knowsVersions = true) {}

	async applyBehaviorBatch(_featureId: string, operations: readonly Record<string, unknown>[], opts: BatchOptions = {}): Promise<BehaviorBatchResult> {
		const refuse = (error: string, raw: unknown = error): BehaviorBatchResult => ({ ...okBatch, ok: false, appliedCount: 0, refs: {}, errors: [error], raw });
		if (!this.knowsVersions && 'expectedUpdatedAt' in opts) return refuse('unknown argument expectedUpdatedAt');
		if (opts.expectedUpdatedAt && opts.expectedUpdatedAt !== this.version)
			return refuse('The feature changed since this batch was written.', { ok: false, conflict: true, currentUpdatedAt: this.version });
		const ops = opts.commit ? this.dryRuns.get(opts.commit) : operations;
		if (!ops) return refuse('unknown commit token');
		if (opts.dryRun) {
			const token = `tok-${this.dryRuns.size + 1}`;
			this.dryRuns.set(token, ops);
			return { ...okBatch, dryRun: true, appliedCount: 0, commitToken: token };
		}
		this.written.push(ops);
		this.version = `v${this.written.length + 1}`;
		return { ...okBatch, appliedCount: ops.length };
	}
}

describe('AuthorBehaviorUseCase, writing through the engine', () => {
	it('writes a batch, writes nothing on a dry run, and saves that dry run from its commit token alone', async () => {
		const engine = new Engine();
		const uc = new AuthorBehaviorUseCase(engine);
		await uc.execute({ featureId: 'f', operations: [{ kind: 'x', n: 1 }] });
		const dry = await uc.execute({ featureId: 'f', operations: [{ kind: 'x', n: 2 }], dryRun: true });
		expect(engine.written).toEqual([[{ kind: 'x', n: 1 }]]);

		await uc.execute({ featureId: 'f', operations: [], commit: dry.batch?.commitToken ?? '' });
		expect(engine.written).toEqual([[{ kind: 'x', n: 1 }], [{ kind: 'x', n: 2 }]]);
	});

	it('refuses a batch, or the commit of a dry run, written against a version the feature has since left', async () => {
		const engine = new Engine();
		const uc = new AuthorBehaviorUseCase(engine);
		const dry = await uc.execute({ featureId: 'f', operations: [{ kind: 'x', n: 2 }], dryRun: true, expectedUpdatedAt: 'v1' });
		await uc.execute({ featureId: 'f', operations: [{ kind: 'x', n: 1 }], expectedUpdatedAt: 'v1' });

		const stale = await uc.execute({ featureId: 'f', operations: [{ kind: 'x', n: 3 }], expectedUpdatedAt: 'v1' });
		const staleCommit = await uc.execute({ featureId: 'f', operations: [], commit: dry.batch?.commitToken ?? '', expectedUpdatedAt: 'v1' });
		expect(stale).toMatchObject({ available: true, batch: { ok: false, conflict: true, currentUpdatedAt: 'v2' } });
		expect(staleCommit.batch?.ok).toBe(false);
		expect(engine.written).toEqual([[{ kind: 'x', n: 1 }]]);
	});

	it('still writes through an engine that predates versions when the caller names none', async () => {
		const engine = new Engine(false);
		const res = await new AuthorBehaviorUseCase(engine).execute({ featureId: 'f', operations: [{ kind: 'x' }] });
		expect(res.batch?.ok).toBe(true);
		expect(engine.written).toHaveLength(1);
	});
});
