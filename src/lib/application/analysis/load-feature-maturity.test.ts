import { describe, expect, it } from 'vitest';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import { UNSPA_FEATURE_FORMAT, UNSPA_VERSION, type UnspaFeatureSnapshot, type UnspaProjectSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort, FeatureMaturityScorerPort, FeaturesDraftRepositoryPort } from '../ports';
import { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';
import { LoadFeatureMaturityUseCase } from './load-feature-maturity';

/** Behavior shells held in memory, keyed by feature id. */
class ShellStore implements BehaviorRepositoryPort {
	constructor(private readonly shells: Record<string, Record<string, unknown>>) {}
	async loadProject(): Promise<UnspaProjectSnapshot | null> {
		return null;
	}
	async saveProject() {}
	async loadFeature(_projectId: string, featureId: string): Promise<UnspaFeatureSnapshot | null> {
		const feature = this.shells[featureId];
		return feature ? { format: UNSPA_FEATURE_FORMAT, version: UNSPA_VERSION, feature } : null;
	}
	async saveFeature() {}
	async deleteProject() {}
	workspaceRoot() {
		return '/mem';
	}
}

/** Scores a shell by the maturity it declares, 0 without a shell, as the engine's scorer would for an unauthored leaf. */
const scorer = {
	score: (snapshot) => (typeof snapshot?.feature.maturity === 'number' ? snapshot.feature.maturity : 0),
	report: () => null
} satisfies FeatureMaturityScorerPort;

function loadFeatures(draft: ProjectFeaturesDraft): LoadFeaturesDraftUseCase {
	const store = { load: async () => draft, save: async () => {} } satisfies FeaturesDraftRepositoryPort;
	return new LoadFeaturesDraftUseCase(store);
}

const leaf = (id: string, name: string, coreId: string) => ({ id, name, coreId, parentFamilyId: null, description: '', unspaghettitFeatureId: id });

const DRAFT: ProjectFeaturesDraft = {
	...createEmptyFeaturesDraft('p1'),
	cores: [{ id: 'core-pay', name: 'Payments', description: '', tone: 'payment' }],
	features: [leaf('f-refund', 'Refund an order', 'core-pay'), leaf('f-orphan', 'Export orders', 'core-gone'), leaf('f-loose', 'Print a receipt', '')]
};

describe('the per-feature behavior maturity', () => {
	it('gives each leaf its maturity, its core by name, and the entities its behavior declares', async () => {
		const rows = await new LoadFeatureMaturityUseCase(
			loadFeatures(DRAFT),
			new ShellStore({ 'f-refund': { maturity: 85, entities: [{ name: ' Order ' }, { name: '' }, { title: 'no name' }, null, { name: 'Refund' }] } }),
			scorer
		).execute('p1');

		expect(rows[0]).toEqual({
			featureId: 'f-refund',
			name: 'Refund an order',
			coreId: 'core-pay',
			coreName: 'Payments',
			maturity: 85,
			entities: ['Order', 'Refund'],
			actions: 0,
			journeyLinked: false
		});
	});

	it('reads a leaf with no behavior shell as 0 with no entity, never as a failure', async () => {
		const rows = await new LoadFeatureMaturityUseCase(loadFeatures(DRAFT), new ShellStore({}), scorer).execute('p1');
		expect(rows.map((r) => [r.featureId, r.maturity, r.entities])).toEqual([
			['f-refund', 0, []],
			['f-orphan', 0, []],
			['f-loose', 0, []]
		]);
	});

	it('leaves the core name empty when the leaf points at a core that no longer exists', async () => {
		const rows = await new LoadFeatureMaturityUseCase(loadFeatures(DRAFT), new ShellStore({}), scorer).execute('p1');
		const orphan = rows.find((r) => r.featureId === 'f-orphan');
		expect(orphan).toMatchObject({ coreId: 'core-gone', coreName: '' });
		const loose = rows.find((r) => r.featureId === 'f-loose');
		expect(loose).toMatchObject({ coreName: '' });
	});

	it('counts the actions in force and says whether a journey links them (criterion a0ebe123)', async () => {
		const act = (id: string, disabled = false) => ({ id, ...(disabled ? { disabled: { by: 'x', at: 'y', reason: 'z' } } : {}) });
		const draft: ProjectFeaturesDraft = {
			...DRAFT,
			actionJourneys: { 'f-refund': [{ id: 'j', name: 'Journeys', nodes: ['a', 'b'], links: [{ from: 'a', to: 'b' }], origin: 'ai' }] }
		};
		const rows = await new LoadFeatureMaturityUseCase(
			loadFeatures(draft),
			new ShellStore({
				'f-refund': { surfaces: [{ actions: [act('a'), act('b')] }] },
				'f-orphan': { surfaces: [{ actions: [act('c'), act('d'), act('e', true)] }] },
				'f-loose': { disabled: { by: 'x', at: 'y', reason: 'z' }, surfaces: [{ actions: [act('f'), act('g')] }] }
			}),
			scorer
		).execute('p1');
		expect(rows.map((r) => [r.featureId, r.actions, r.journeyLinked])).toEqual([
			['f-refund', 2, true],
			['f-orphan', 2, false],
			['f-loose', 0, false]
		]);
	});
});
