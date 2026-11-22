import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, createFeature } from '$domain/features';
import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { LoadImplementationCoverageUseCase } from './load-implementation-coverage';
import type { BehaviorRepositoryPort, CodeAdoptionPort } from '../ports';

type Shells = Pick<BehaviorRepositoryPort, 'loadFeature'>;
type Engine = Pick<CodeAdoptionPort, 'available' | 'getImplementationStatus'>;

/** Two leaves; ids are what the engine is asked for. */
const FEATURES = {
	...createEmptyFeaturesDraft('project-1'),
	features: [createFeature('', null, { id: 'feat-a', name: 'Send invoices' }), createFeature('', null, { id: 'feat-b', name: 'Archive invoices' })]
};

/** A behavior store whose shells carry the given spec stamps. */
function shells(updatedAt: Record<string, string | undefined> = {}): Shells {
	return {
		loadFeature: async (_projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> =>
			featureId in updatedAt ? { format: UNSPA_FEATURE_FORMAT, version: UNSPA_VERSION, feature: { id: featureId, updatedAt: updatedAt[featureId] } } : null
	};
}

function useCase(port: Partial<Engine>, behavior: Shells = shells()) {
	const engine: Engine = { available: true, getImplementationStatus: async () => null, ...port };
	return new LoadImplementationCoverageUseCase({ execute: async () => FEATURES }, engine, behavior);
}

const sidecar = (value: Record<string, unknown>) => ({ ok: true as const, value });

describe('LoadImplementationCoverageUseCase', () => {
	it('folds found/expected across action and surface rows into a percent', async () => {
		const coverage = await useCase({
			getImplementationStatus: async (featureId: string) =>
				featureId === 'feat-a'
					? sidecar({
							updatedAt: '2026-08-15T10:00:00.000Z',
							actions: [
								{ foundEntities: [{}, {}], missingEntities: [{}], expectedEntities: [{}, {}, {}] }
							],
							surfaces: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }]
						})
					: sidecar({ status: null })
		}).execute('project-1');

		expect(coverage['feat-a']).toEqual({
			featureId: 'feat-a',
			found: 3,
			expected: 4,
			percent: 75,
			actions: {},
			updatedAt: '2026-08-15T10:00:00.000Z',
			specUpdatedAt: null
		});
		// A never-adopted feature has NO entry, so no chip ever renders for it.
		expect(coverage['feat-b']).toBeUndefined();
	});

	it('splits per-action coverage rows keyed by action id', async () => {
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({
					actions: [
						{
							actionId: 'act-1',
							foundEntities: [{}, {}],
							missingEntities: [],
							expectedEntities: [{}, {}]
						},
						{ actionId: 'act-2', foundEntities: [], missingEntities: [{}], expectedEntities: [{}] },
						// A row without an id still counts in the feature totals.
						{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }
					],
					surfaces: []
				})
		}).execute('project-1');

		expect(coverage['feat-a']?.actions).toEqual({
			'act-1': { found: 2, expected: 2, percent: 100, elements: [] },
			'act-2': { found: 0, expected: 1, percent: 0, elements: [] }
		});
		expect(coverage['feat-a']?.percent).toBe(75);
	});

	it('lists each element an action expected with where the code carries it (criterion d42a090d)', async () => {
		const rule = { entityType: 'rule', entityId: 'r1', entityName: 'Only the owner deletes', tag: 't' };
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({
					actions: [
						{
							actionId: 'act-1',
							expectedEntities: [
								{ entityType: 'action', entityId: 'act-1', entityName: 'deleteRoom', tag: 't' },
								rule,
								{ entityType: 'event', entityId: 'room.deleted', tag: 't' }
							],
							foundEntities: [
								{
									entityType: 'action',
									entityId: 'act-1',
									entityName: 'deleteRoom',
									locations: [{ file: 'src/rooms/delete-room.ts', line: 12, snippet: 'export function deleteRoom(room) {' }, { file: 'src/other.ts' }]
								},
								{ entityType: 'event', entityId: 'room.deleted', locations: [] }
							],
							missingEntities: [rule]
						}
					],
					surfaces: []
				})
		}).execute('project-1');

		expect(coverage['feat-a']?.actions?.['act-1']?.elements).toEqual([
			// The signature line the index recorded rides along: what the code changed outside Lyriks is read against.
			{ kind: 'action', id: 'act-1', name: 'deleteRoom', location: { file: 'src/rooms/delete-room.ts', line: 12, snippet: 'export function deleteRoom(room) {' } },
			{ kind: 'rule', id: 'r1', name: 'Only the owner deletes', location: null },
			// Located without a file: still located, never read as missing.
			{ kind: 'event', id: 'room.deleted', name: 'room.deleted', location: { file: '', line: null } }
		]);
	});

	it('keeps the proof stamp of each action and tallies the active criteria (Proven against code)', async () => {
		const coverage = await useCase({
			getImplementationStatus: async (featureId: string) =>
				featureId === 'feat-a'
					? sidecar({
							actions: [
								{ actionId: 'act-1', foundEntities: [{}], expectedEntities: [{}], auditMeta: { verifiedAt: '2026-11-02T08:00:00.000Z' } },
								{ actionId: 'act-2', foundEntities: [{}], expectedEntities: [{}], auditMeta: { auditedAt: '2026-11-01T00:00:00.000Z' } }
							],
							surfaces: [],
							criteria: [
								{ criterionId: 'c1', standing: 'active', state: 'verified' },
								{ criterionId: 'c2', standing: 'active, but superseded by c1', state: 'failing' },
								{ criterionId: 'c3', standing: 'draft', state: 'verified' },
								{ criterionId: 'c4', standing: 'superseded by c1', state: 'failing' },
								{ criterionId: 'c5', state: 'none' },
								{ criterionId: 'c6', standing: 'active', state: 'failing' }
							]
						})
					: sidecar({ actions: [{ actionId: 'act-9', foundEntities: [{}], expectedEntities: [{}] }], surfaces: [] })
		}).execute('project-1');

		expect(coverage['feat-a']?.actions?.['act-1']?.provenAt).toBe('2026-11-02T08:00:00.000Z');
		// Located is not proven: no stamp, no provenAt.
		expect(coverage['feat-a']?.actions?.['act-2']).not.toHaveProperty('provenAt');
		// Draft and superseded criteria hold nothing yet; a row without a standing is active,
		// and a criterion never run is neither verified nor failing.
		expect(coverage['feat-a']?.criteria).toEqual({ total: 4, verified: 1, failing: 2 });
		// An engine that sends no criteria block says nothing, which is not zero.
		expect(coverage['feat-b']).not.toHaveProperty('criteria');
	});

	it('keeps the last result of each scenario the sync carried with the action, the unreadable ones left out [criterion:d0f1688f]', async () => {
		const at = '2026-11-20T01:00:00.000Z';
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({
					actions: [
						{
							actionId: 'act-1',
							foundEntities: [{}],
							expectedEntities: [{}],
							auditMeta: {
								scenarioResults: {
									'sc-1': { passed: true, at, revision: 'abc1234' },
									'sc-2': { passed: false, at, dirty: true },
									'sc-3': { passed: 'yes', at },
									'sc-4': { passed: true }
								}
							}
						},
						{ actionId: 'act-2', foundEntities: [{}], expectedEntities: [{}], auditMeta: { verifiedAt: at } }
					],
					surfaces: []
				})
		}).execute('project-1');

		const actions = coverage['feat-a']?.actions ?? {};
		expect(actions['act-1']?.scenarioResults).toEqual({ 'sc-1': { passed: true, at, revision: 'abc1234' }, 'sc-2': { passed: false, at } });
		// A failing scenario leaves no proof stamp on its action.
		expect(actions['act-1']).not.toHaveProperty('provenAt');
		// An engine or an index that kept no result per scenario says nothing, which is not a failure.
		expect(actions['act-2']).not.toHaveProperty('scenarioResults');
	});

	it('falls back to found+missing when a legacy row lacks expectedEntities', async () => {
		const coverage = await useCase({
			getImplementationStatus: async () =>
				sidecar({ actions: [{ foundEntities: [{}], missingEntities: [{}, {}, {}] }], surfaces: [] })
		}).execute('project-1');

		expect(coverage['feat-a']?.percent).toBe(25);
		expect(coverage['feat-a']?.expected).toBe(4);
	});

	it('returns {} without touching the engine when it is unavailable', async () => {
		let asked = 0;
		const coverage = await useCase({
			available: false,
			getImplementationStatus: async () => (asked++, null)
		}).execute('project-1');

		expect(coverage).toEqual({});
		expect(asked).toBe(0);
	});

	it('swallows per-feature engine failures instead of failing the page', async () => {
		const coverage = await useCase({
			getImplementationStatus: async (featureId: string) => {
				if (featureId === 'feat-a') throw new Error('engine hiccup');
				return sidecar({
					actions: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }],
					surfaces: []
				});
			}
		}).execute('project-1');

		expect(coverage['feat-a']).toBeUndefined();
		expect(coverage['feat-b']?.percent).toBe(100);
	});
});

describe('LoadImplementationCoverageUseCase spec stamps', () => {
	const adopted = {
		getImplementationStatus: async () =>
			({
				ok: true as const,
				value: {
					updatedAt: '2026-08-15T10:00:00.000Z',
					actions: [{ foundEntities: [{}], missingEntities: [], expectedEntities: [{}] }],
					surfaces: []
				}
			})
	};

	it('reads the kernel shell LIVE, so an edit after the sync is visible', async () => {
		const coverage = await useCase(
			adopted,
			shells({ 'feat-a': '2026-08-16T09:00:00.000Z' })
		).execute('project-1');

		expect(coverage['feat-a']?.specUpdatedAt).toBe('2026-08-16T09:00:00.000Z');
		expect(coverage['feat-a']?.updatedAt).toBe('2026-08-15T10:00:00.000Z');
	});

	it('keeps the coverage row when the shell is missing or unreadable', async () => {
		const missing = await useCase(adopted, shells()).execute('project-1');
		expect(missing['feat-a']?.percent).toBe(100);
		expect(missing['feat-a']?.specUpdatedAt).toBeNull();

		const broken = await useCase(adopted, {
			loadFeature: async () => {
				throw new Error('kernel folder gone');
			}
		}).execute('project-1');
		expect(broken['feat-a']?.percent).toBe(100);
		expect(broken['feat-a']?.specUpdatedAt).toBeNull();
	});
});
