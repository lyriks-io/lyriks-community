import { describe, expect, it } from 'vitest';
import type { BehaviorRepositoryPort, ExperienceDraftRepositoryPort, FeaturesDraftRepositoryPort } from '$application/ports';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import { createCore, createEmptyFeaturesDraft, createFeature, type ProjectFeaturesDraft } from '$domain/features/draft';
import { createEmptyExperienceDraft, createJourney, createStep, type ProjectExperienceDraft } from '$domain/experience/draft';
import { FeaturesDraftUpstreamProvider } from './features-draft-upstream-provider.server';

/**
 * What the permissions matrix may grant: the features with their actions, the
 * journeys that carry a step, the surfaces, read from the features draft, the
 * experience draft and the behavior kernel.
 */

function drafts(features: ProjectFeaturesDraft | null, experience: ProjectExperienceDraft | null, kernel: Record<string, unknown> = {}) {
	const kernelReads: string[] = [];
	const featureStore = { load: async () => features, save: async () => {} } satisfies FeaturesDraftRepositoryPort;
	const experienceStore = { load: async () => experience, save: async () => {} } satisfies ExperienceDraftRepositoryPort;
	const behavior = {
		loadProject: async () => null,
		saveProject: async () => {},
		loadFeature: async (_projectId, featureId) => {
			kernelReads.push(featureId);
			const feature = kernel[featureId];
			return feature ? ({ format: 'unspaghettit', version: 1, feature } as UnspaFeatureSnapshot) : null;
		},
		saveFeature: async () => {},
		deleteProject: async () => {},
		workspaceRoot: () => '/mem'
	} satisfies BehaviorRepositoryPort;
	return { provider: new FeaturesDraftUpstreamProvider(featureStore, experienceStore, behavior), kernelReads };
}

const core = createCore({ id: 'core-buy', name: 'Buy' });
const checkout = createFeature('core-buy', null, { id: 'feat-checkout', name: 'Checkout' });
const wishlist = createFeature('core-buy', null, { id: 'feat-wishlist', name: 'Wishlist' });

function features(): ProjectFeaturesDraft {
	const draft = createEmptyFeaturesDraft('p');
	draft.cores = [core];
	draft.features = [checkout, wishlist];
	return draft;
}

function experience(): ProjectExperienceDraft {
	const draft = createEmptyExperienceDraft('p');
	const walked = createJourney('core-buy', 0, { id: 'j-buy', name: 'Buy a book' });
	const empty = createJourney('core-buy', 1, { id: 'j-empty', name: 'Not drawn yet' });
	const orphan = createJourney('core-gone', 2, { id: 'j-orphan', name: '' });
	draft.journeys = [walked, empty, orphan];
	draft.steps = [createStep('j-buy', 0, { id: 's1' }), createStep('j-orphan', 0, { id: 's2' })];
	return draft;
}

describe('the capabilities the permissions matrix grants', () => {
	it('lists one row per journey that carries a step, under its stage name', async () => {
		const { provider } = drafts(features(), experience());
		expect(await provider.listJourneyCapabilities('p')).toEqual([
			{ id: 'j-buy', label: 'Buy a book', source: 'journey', sourceRefId: 'core-buy', sourceRefLabel: 'Buy' },
			{ id: 'j-orphan', label: '<unnamed journey>', source: 'journey', sourceRefId: 'core-gone', sourceRefLabel: '<unknown core>' }
		]);
	});

	it('lists each action a feature declares, and a feature without actions as itself', async () => {
		const { provider } = drafts(features(), experience(), {
			'feat-checkout': { id: 'feat-checkout', surfaces: [{ id: 'srf-cart', actions: [{ id: 'act-pay', name: 'Pay' }, { id: 'act-pay', name: 'Pay again' }] }] }
		});
		const rows = await provider.listFeatureCapabilities('p');
		expect(rows.map((r) => [r.label, r.featureId ?? r.id, r.sourceRefLabel])).toEqual([
			['Pay', 'feat-checkout', 'Buy'],
			['Wishlist', 'feat-wishlist', 'Buy']
		]);
	});

	it('counts each feature once among the capability ids, with the journeys', async () => {
		const { provider } = drafts(features(), experience());
		const ids = await provider.listCapabilityIds('p');
		expect(ids.slice(0, 4)).toEqual(['feat-checkout', 'feat-wishlist', 'j-buy', 'j-orphan']);
	});

	it('grants nothing on a project without drafts', async () => {
		const { provider } = drafts(null, null);
		expect(await provider.listFeatureCapabilities('p')).toEqual([]);
		expect(await provider.listJourneyCapabilities('p')).toEqual([]);
		expect(await provider.listCapabilityIds('p')).toEqual([]);
	});

	it('reads the kernel once per leaf when the feature and surface rows are asked together', async () => {
		const { provider, kernelReads } = drafts(features(), experience());
		await Promise.all([provider.listFeatureCapabilities('p'), provider.listSurfaceCapabilities('p')]);
		expect(kernelReads.sort()).toEqual(['feat-checkout', 'feat-wishlist']);
	});
});
