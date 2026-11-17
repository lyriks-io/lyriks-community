import { describe, expect, it, vi } from 'vitest';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyDefinitionDraft, type FoundationDefinitionDraft } from '$domain/foundation';
import { SyncBehaviorProjectUseCase } from './sync-behavior-project';
import type { UnspaProjectSnapshot } from '$lib/unspa-schema';

function setup(definition: FoundationDefinitionDraft | null) {
	const behavior = { loadProject: vi.fn().mockResolvedValue(null) };
	const back = { propagateProject: vi.fn().mockResolvedValue(undefined) };
	const clock = { nowIso: () => '2026-06-01T00:00:00.000Z' };
	const definitionDrafts = { load: vi.fn().mockResolvedValue(definition), save: vi.fn() };
	// Only the methods the use case touches are needed; cast through unknown.
	const useCase = new SyncBehaviorProjectUseCase(
		behavior as never,
		back as never,
		clock as never,
		definitionDrafts as never
	);
	return { useCase, back };
}

const tagValues = (snap: UnspaProjectSnapshot, type: string) =>
	snap.project.tags.filter((t) => t.type === type).map((t) => t.value);

describe('SyncBehaviorProjectUseCase — definition-aware tags', () => {
	it('keeps Step 01 tags when there is no definition draft yet', async () => {
		const { useCase } = setup(null);
		const init = createEmptyIdentityDraft('p1'); // industry defaults to 'saas'
		init.formFactors = ['web_interface'];
		const snap = await useCase.execute(init);
		expect(tagValues(snap, 'origin')).toEqual(['lyriks-wizard']);
		expect(tagValues(snap, 'industry')).toEqual(['saas']);
		expect(tagValues(snap, 'integration')).toEqual([]);
	});

	it('folds definition facets (integration, auth, certification, regulation, category) into tags', async () => {
		const definition = createEmptyDefinitionDraft('p1');
		definition.technical.integrations = [
			{ system: 'Stripe', direction: 'both', criticality: 'high' }
		];
		definition.security.authentication = ['sso', 'mfa'];
		definition.security.expectedCertifications = ['SOC2_Type_II'];
		definition.market.regulations = ['GDPR'];
		definition.competition.claimedCategory = 'Invoice-to-cash automation';

		const { useCase } = setup(definition);
		const snap = await useCase.execute(createEmptyIdentityDraft('p1'));

		expect(tagValues(snap, 'integration')).toEqual(['Stripe']);
		expect(tagValues(snap, 'auth')).toEqual(['sso', 'mfa']);
		expect(tagValues(snap, 'certification')).toEqual(['SOC2_Type_II']);
		expect(tagValues(snap, 'regulation')).toEqual(['GDPR']);
		expect(tagValues(snap, 'category')).toEqual(['Invoice-to-cash automation']);
	});

	it('skips empty values and dedupes', async () => {
		const definition = createEmptyDefinitionDraft('p1');
		definition.technical.integrations = [
			{ system: 'Stripe', direction: 'both', criticality: 'high' },
			{ system: 'Stripe', direction: 'in', criticality: 'low' },
			{ system: '  ', direction: 'out', criticality: 'low' }
		];
		definition.competition.claimedCategory = '   ';
		const { useCase } = setup(definition);
		const snap = await useCase.execute(createEmptyIdentityDraft('p1'));
		expect(tagValues(snap, 'integration')).toEqual(['Stripe']);
		expect(tagValues(snap, 'category')).toEqual([]);
	});
});
