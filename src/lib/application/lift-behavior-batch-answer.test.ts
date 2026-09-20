import { describe, expect, it } from 'vitest';
import type { BehaviorBatchResult } from '$application/ports';
import { liftBehaviorBatchAnswer } from './lift-behavior-batch-answer';

const base: BehaviorBatchResult = {
	ok: true,
	dryRun: false,
	appliedCount: 1,
	refs: {},
	errors: [],
	maturityPercentage: null,
	commitToken: null,
	raw: {}
};

describe('liftBehaviorBatchAnswer', () => {
	it('returns the very same batch when an older engine says none of it', () => {
		const batch = { ...base, raw: { ok: true, appliedCount: 1, refs: {} } };
		expect(liftBehaviorBatchAnswer(batch)).toBe(batch);
	});

	it('leaves a batch alone when raw is not an engine answer (facade rejection text, null, a list)', () => {
		for (const raw of ['Batch failed: nope', null, undefined, ['conflict']]) {
			const batch = { ...base, ok: false, raw };
			expect(liftBehaviorBatchAnswer(batch)).toBe(batch);
		}
	});

	it('lifts a conflict with the version to rebase on and what changed meanwhile', () => {
		const raw = {
			ok: false,
			conflict: true,
			expectedUpdatedAt: '2026-09-20T10:00:00.000Z',
			currentUpdatedAt: '2026-09-20T10:05:00.000Z',
			changedSince: ['action:act-1', 'state:cart.total'],
			changedSinceTotal: 7,
			errors: ['The feature changed since 2026-09-20T10:00:00.000Z.']
		};
		const lifted = liftBehaviorBatchAnswer({ ...base, ok: false, appliedCount: 0, raw });
		expect(lifted).toMatchObject({
			ok: false,
			conflict: true,
			currentUpdatedAt: '2026-09-20T10:05:00.000Z',
			changedSince: ['action:act-1', 'state:cart.total'],
			changedSinceTotal: 7
		});
		expect(lifted.raw).toBe(raw);
	});

	it('lifts the versions of a save, what it touches elsewhere and its scenarios', () => {
		const relatedElsewhere = [{ featureId: 'feat-other', elements: ['event:order-placed'] }];
		const scenarios = { scope: 'touched', run: 2, passed: 2, failed: [] };
		const lifted = liftBehaviorBatchAnswer({
			...base,
			raw: {
				ok: true,
				previousUpdatedAt: '2026-09-20T10:00:00.000Z',
				updatedAt: '2026-09-20T10:01:00.000Z',
				relatedElsewhere,
				scenarios
			}
		});
		expect(lifted.previousUpdatedAt).toBe('2026-09-20T10:00:00.000Z');
		expect(lifted.updatedAt).toBe('2026-09-20T10:01:00.000Z');
		expect(lifted.relatedElsewhere).toBe(relatedElsewhere);
		expect(lifted.scenarios).toBe(scenarios);
		expect(lifted.conflict).toBeUndefined();
	});

	it('never states what the engine did not: no conflict:false, no empty list, no zero', () => {
		const lifted = liftBehaviorBatchAnswer({
			...base,
			raw: { ok: true, conflict: false, updatedAt: '2026-09-20T10:01:00.000Z' }
		});
		expect('conflict' in lifted).toBe(false);
		expect('changedSince' in lifted).toBe(false);
		expect('changedSinceTotal' in lifted).toBe(false);
		expect('relatedElsewhere' in lifted).toBe(false);
		expect('scenarios' in lifted).toBe(false);
	});

	it('drops a field sent in the wrong shape rather than relaying it', () => {
		const lifted = liftBehaviorBatchAnswer({
			...base,
			raw: {
				conflict: 'yes',
				currentUpdatedAt: 42,
				changedSince: ['action:a', 7, null],
				changedSinceTotal: 'many',
				scenarios: 'all green'
			}
		});
		expect('conflict' in lifted).toBe(false);
		expect('currentUpdatedAt' in lifted).toBe(false);
		expect(lifted.changedSince).toEqual(['action:a']);
		expect('changedSinceTotal' in lifted).toBe(false);
		expect('scenarios' in lifted).toBe(false);
	});

	it('keeps raw last so a reader meets the lifted fields before the long answer', () => {
		const lifted = liftBehaviorBatchAnswer({ ...base, raw: { updatedAt: '2026-09-20T10:01:00.000Z' } });
		expect(Object.keys(lifted).at(-1)).toBe('raw');
	});
});
