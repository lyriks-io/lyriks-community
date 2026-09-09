import { describe, expect, it } from 'vitest';
import type { BehaviorBatchResult, UnspaghettitAdvisorPort } from '$application/ports';
import { AuthorBehaviorUseCase } from './author-behavior';

const applied: BehaviorBatchResult = {
	ok: true,
	dryRun: false,
	appliedCount: 1,
	refs: {},
	errors: [],
	maturityPercentage: 90,
	commitToken: null,
	raw: {}
};

const advisor = {
	applyBehaviorBatch: async () => applied
} as unknown as Pick<UnspaghettitAdvisorPort, 'applyBehaviorBatch'>;

const run = (operations: Record<string, unknown>[]) =>
	new AuthorBehaviorUseCase(advisor).execute({ featureId: 'feat-1', operations });

const allowRule = (actionRef: string) => ({
	kind: 'add_action_rule',
	actionRef,
	rule: { category: 'business', effect: { type: 'allow_action' } }
});

describe('AuthorBehaviorUseCase handler warnings', () => {
	it('warns that a handler will run on its own defaults', async () => {
		// A cascade passes no input, so the parameter can only ever be its default.
		const result = await run([
			{ kind: 'add_action', ref: 'act', name: 'Recount', triggeredByEvent: 'features.status_changed' },
			allowRule('act'),
			{ kind: 'add_parameter', actionRef: 'act', name: 'statusCount', required: false, default: 0 }
		]);

		expect(result.batch?.ok).toBe(true);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('Recount');
		expect(result.warnings[0]).toContain('statusCount');
	});

	it('says so plainly when an effect writes state from that parameter', async () => {
		const result = await run([
			{ kind: 'add_action', ref: 'act', name: 'Recount', triggeredByEvent: 'features.status_changed' },
			allowRule('act'),
			{ kind: 'add_parameter', actionRef: 'act', name: 'statusCount' },
			{
				kind: 'add_effect',
				actionRef: 'act',
				value: { type: 'set_state', path: 'queue.count', value: { kind: 'param', name: 'statusCount' } }
			}
		]);

		expect(result.warnings[0]).toContain('overwrite that state with the default');
	});

	it('leaves a handler with no parameters alone', async () => {
		// The documented cross-feature pattern: a mirrored event and an ingest
		// action that reads state directly. Nothing to warn about.
		const result = await run([
			{ kind: 'add_action', ref: 'act', name: 'Record passing test', triggeredByEvent: 'zap.tested' },
			allowRule('act')
		]);

		expect(result.warnings).toEqual([]);
	});

	it('leaves an ordinary parameterized action alone', async () => {
		const result = await run([
			{ kind: 'add_action', ref: 'act', name: 'Publish' },
			allowRule('act'),
			{ kind: 'add_parameter', actionRef: 'act', name: 'note' }
		]);

		expect(result.warnings).toEqual([]);
	});

	it('carries no warnings on a batch it refused', async () => {
		const result = await run([{ kind: 'add_action', ref: 'act', name: 'Publish' }]);

		expect(result.batch?.ok).toBe(false);
		expect(result.warnings).toEqual([]);
	});
});
