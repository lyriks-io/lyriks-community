import { describe, expect, it } from 'vitest';
import { createEmptyExperienceDraft, createJourney, type ProjectExperienceDraft } from '$domain/experience';
import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import type { ExperienceDraftRepositoryPort, FeaturesDraftRepositoryPort } from '../ports';
import { LoadExperienceDraftUseCase } from './load-experience-draft';

/** A Step 05 store holding at most one saved draft. */
function experienceStore(saved: ProjectExperienceDraft | null): ExperienceDraftRepositoryPort {
	return { load: async () => saved, save: async () => {} } satisfies ExperienceDraftRepositoryPort;
}

/** A Step 04 store holding at most one saved feature tree. */
function featuresStore(saved: ProjectFeaturesDraft | null): FeaturesDraftRepositoryPort {
	return { load: async () => saved, save: async () => {} } satisfies FeaturesDraftRepositoryPort;
}

function featuresWithCores(...cores: { id: string; name: string }[]): ProjectFeaturesDraft {
	return { ...createEmptyFeaturesDraft('p1'), cores: cores.map((c) => ({ ...c, description: '', tone: 'custom' as const })) };
}

describe('loading the Experience draft', () => {
	it('mirrors the Feature step cores as its stages, in their order, whatever stages were saved before', async () => {
		const saved = {
			...createEmptyExperienceDraft('p1'),
			derivedCores: [{ id: 'gone', name: 'Removed core', order: 0, tone: 'custom' as const, sourceRefId: 'gone' }]
		};
		const draft = await new LoadExperienceDraftUseCase(
			experienceStore(saved),
			featuresStore(featuresWithCores({ id: 'c-order', name: 'Ordering' }, { id: 'c-pay', name: 'Paying' }))
		).execute('p1');

		expect(draft.derivedCores).toEqual([
			{ id: 'c-order', name: 'Ordering', order: 0, tone: 'custom', sourceRefId: 'c-order' },
			{ id: 'c-pay', name: 'Paying', order: 1, tone: 'custom', sourceRefId: 'c-pay' }
		]);
	});

	it('names a core left without a name so its stage still reads', async () => {
		const draft = await new LoadExperienceDraftUseCase(experienceStore(null), featuresStore(featuresWithCores({ id: 'c1', name: '' }))).execute('p1');
		expect(draft.derivedCores.map((c) => c.name)).toEqual(['<unnamed core>']);
	});

	it('keeps a journey whose core was deleted upstream, still pointing at it', async () => {
		const orphan = createJourney('deleted-core', 0, { id: 'j1', name: 'Checkout' });
		const draft = await new LoadExperienceDraftUseCase(
			experienceStore({ ...createEmptyExperienceDraft('p1'), journeys: [orphan] }),
			featuresStore(featuresWithCores({ id: 'c1', name: 'Ordering' }))
		).execute('p1');

		expect(draft.journeys.map((j) => [j.id, j.coreId])).toEqual([['j1', 'deleted-core']]);
		expect(draft.derivedCores.map((c) => c.id)).toEqual(['c1']);
	});

	it('starts from an empty draft with no stage when nothing was saved on either step', async () => {
		const draft = await new LoadExperienceDraftUseCase(experienceStore(null), featuresStore(null)).execute('p1');
		expect(draft.projectId).toBe('p1');
		expect(draft.journeys).toEqual([]);
		expect(draft.derivedCores).toEqual([]);
	});
});
