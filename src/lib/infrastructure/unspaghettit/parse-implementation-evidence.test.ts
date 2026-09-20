import { describe, expect, it } from 'vitest';
import { parseCriteriaEvidence, parseProvenActions } from './parse-implementation-evidence';

/** What the engine the platform ships answers today: rows, and neither block. */
const olderAnswer = {
	featureId: 'feat-1',
	actions: [{ actionId: 'act-1', expectedEntities: [1, 2], foundEntities: [1] }],
	surfaces: []
};

describe('parseProvenActions', () => {
	it('is undefined on an engine that does not report it: unknown, never zero', () => {
		expect(parseProvenActions(olderAnswer)).toBeUndefined();
		expect(parseProvenActions(null)).toBeUndefined();
		expect(parseProvenActions('status')).toBeUndefined();
	});

	it('reads the actions a passing run stamped, out of the feature total', () => {
		expect(parseProvenActions({ ...olderAnswer, verified: { actions: 3, total: 7 } })).toEqual({
			actions: 3,
			total: 7
		});
		// Zero is a real answer once the engine gives it.
		expect(parseProvenActions({ verified: { actions: 0, total: 4 } })).toEqual({ actions: 0, total: 4 });
	});

	it('drops a block it cannot read whole instead of completing it', () => {
		for (const verified of [{ actions: 3 }, { actions: '3', total: 7 }, { actions: -1, total: 7 }, { actions: 1.5, total: 7 }, [3, 7], true]) {
			expect(parseProvenActions({ verified })).toBeUndefined();
		}
	});
});

describe('parseCriteriaEvidence', () => {
	it('is undefined on an engine that does not report the block', () => {
		expect(parseCriteriaEvidence(olderAnswer)).toBeUndefined();
		expect(parseCriteriaEvidence({ criteria: { total: 2 } })).toBeUndefined();
		expect(parseCriteriaEvidence(undefined)).toBeUndefined();
	});

	it('keeps an empty list as the engine saying the feature has no criteria', () => {
		expect(parseCriteriaEvidence({ criteria: [] })).toEqual([]);
	});

	it('keeps id, title, standing, state, stale and what verifies the criterion', () => {
		const criteria = parseCriteriaEvidence({
			criteria: [
				{
					criterionId: 'crit-1',
					title: 'Footsteps are silent in deep water',
					standing: 'active',
					key: 'criterion:crit-1',
					indexed: true,
					state: 'verified',
					stale: false,
					file: 'tests/footsteps.spec.ts',
					line: 12,
					verification: {
						kind: 'integration',
						command: 'pnpm vitest run tests/footsteps.spec.ts',
						files: ['tests/footsteps.spec.ts'],
						artifacts: ['reports/footsteps.json'],
						lastResult: { passed: true, at: '2026-09-20T09:00:00.000Z', summary: '6 of 6', revision: 'abc1234' }
					},
					specVersion: 3,
					syncedAt: '2026-09-20T09:05:00.000Z'
				}
			]
		});
		expect(criteria).toEqual([
			{
				id: 'crit-1',
				title: 'Footsteps are silent in deep water',
				standing: 'active',
				state: 'verified',
				stale: false,
				verification: {
					kind: 'integration',
					command: 'pnpm vitest run tests/footsteps.spec.ts',
					files: ['tests/footsteps.spec.ts'],
					artifacts: ['reports/footsteps.json'],
					lastResult: { passed: true, at: '2026-09-20T09:00:00.000Z', summary: '6 of 6' }
				}
			}
		]);
	});

	it('caps file lists at the first five', () => {
		const files = Array.from({ length: 9 }, (_, i) => `tests/part-${i + 1}.spec.ts`);
		const [criterion] = parseCriteriaEvidence({
			criteria: [{ criterionId: 'crit-1', title: 'T', state: 'unverified', verification: { kind: 'unit', files, artifacts: files } }]
		})!;
		expect(criterion.verification?.files).toEqual(files.slice(0, 5));
		expect(criterion.verification?.artifacts).toEqual(files.slice(0, 5));
	});

	it('reads a criterion nothing verifies, its standing when it is not plain active, and staleness', () => {
		const criteria = parseCriteriaEvidence({
			criteria: [
				{ criterionId: 'crit-old', title: 'Old rule', standing: 'superseded by crit-new', indexed: false, state: 'none', stale: false },
				{ criterionId: 'crit-new', title: 'New rule', standing: 'active', indexed: true, state: 'failing', stale: true,
					verification: { kind: 'e2e', lastResult: { passed: false, at: '2026-09-19T18:00:00.000Z' } } }
			]
		})!;
		expect(criteria[0]).toEqual({ id: 'crit-old', title: 'Old rule', standing: 'superseded by crit-new', state: 'none', stale: false });
		expect(criteria[1]).toMatchObject({ id: 'crit-new', state: 'failing', stale: true });
		expect(criteria[1].verification?.lastResult).toEqual({ passed: false, at: '2026-09-19T18:00:00.000Z' });
	});

	it('re-derives a state this build does not know from the facts it stands for', () => {
		const at = '2026-09-20T09:00:00.000Z';
		const row = (extra: Record<string, unknown>) => ({ criterionId: 'c', title: 'T', state: 'quarantined', ...extra });
		const states = parseCriteriaEvidence({
			criteria: [
				row({ indexed: false }),
				row({ indexed: true }),
				row({ indexed: true, verification: { kind: 'unit', lastResult: { passed: true, at } } }),
				row({ indexed: true, verification: { kind: 'unit', lastResult: { passed: false, at } } }),
				row({})
			]
		})!.map((criterion) => criterion.state);
		expect(states).toEqual(['none', 'unverified', 'verified', 'failing', 'none']);
	});

	it('drops what it cannot read and keeps the rest of the row', () => {
		const criteria = parseCriteriaEvidence({
			criteria: [
				null,
				'crit-text',
				{ title: 'A row without an id' },
				{ criterionId: 'crit-1', state: 'unverified', verification: { command: 'no kind, so no block' } },
				{ criterionId: 'crit-2', state: 'unverified', verification: { kind: 'manual', files: 'one.ts', lastResult: { passed: 'yes', at: 'today' } } },
				{ criterionId: 'crit-3', state: 'verified', verification: { kind: 'unit', lastResult: { passed: true } } }
			]
		})!;
		expect(criteria).toEqual([
			// No title falls back to the id, no standing to plain active, no stale to false.
			{ id: 'crit-1', title: 'crit-1', standing: 'active', state: 'unverified', stale: false },
			{ id: 'crit-2', title: 'crit-2', standing: 'active', state: 'unverified', stale: false, verification: { kind: 'manual' } },
			// A result without a date is left out; the engine's own state is kept.
			{ id: 'crit-3', title: 'crit-3', standing: 'active', state: 'verified', stale: false, verification: { kind: 'unit' } }
		]);
	});
});
