import { describe, expect, it, vi } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyExperienceDraft } from '$domain/experience';
import {
	createCore,
	createEmptyFeaturesDraft,
	createFeature
} from '$domain/features';
import { createEmptyOperationsDraft } from '$domain/foundation';
import { createEmptyDefinitionDraft } from '$domain/foundation';
import { createEmptyIdentityDraft } from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyUsersDraft } from '$domain/users';
import { LocalGlobalCoherenceChecker } from './local-global-coherence-checker';

const loader = <T>(value: T) => ({ execute: vi.fn(async () => value) });

function checker(features = createEmptyFeaturesDraft('project-1')) {
	const behavior = {
		loadFeature: vi.fn(async () => null)
	};
	const foundation = {
		loadIdentity: vi.fn(async () => createEmptyIdentityDraft('project-1')),
		loadDefinition: vi.fn(async () => createEmptyDefinitionDraft('project-1')),
		loadOperations: vi.fn(async () => createEmptyOperationsDraft('project-1'))
	};
	const instance = new LocalGlobalCoherenceChecker(
		foundation as never,
		loader(createEmptyUsersDraft('project-1')) as never,
		loader(features) as never,
		loader(createEmptyExperienceDraft('project-1')) as never,
		loader(createEmptyRulesDraft('project-1')) as never,
		loader(createEmptyDataDraft('project-1')) as never,
		loader(createEmptyArchitectureDraft('project-1')) as never,
		loader(createEmptyGlossaryDraft('project-1')) as never,
		behavior as never,
		{ score: (snapshot: unknown) => (snapshot ? 90 : 0) } as never
	);
	return { instance, behavior };
}

describe('LocalGlobalCoherenceChecker feature evidence', () => {
	it('keeps Features and maturity visible at zero when no leaf exists', async () => {
		const analysis = await checker().instance.analyze('project-1');

		expect(analysis.dimensions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'features', score: 0 }),
				expect.objectContaining({ key: 'maturity', score: 0 })
			])
		);
		expect(analysis.gaps).toContainEqual(
			expect.objectContaining({
				id: 'gap-features-missing-leaf',
				kind: 'missing',
				blocking: true
			})
		);
		expect(analysis.readinessScore).toBeLessThan(50);
	});

	it('blocks a leaf whose canonical kernel record is missing', async () => {
		const features = createEmptyFeaturesDraft('project-1');
		features.cores = [createCore({ id: 'core-multiplayer', name: 'Multiplayer' })];
		features.features = [
			createFeature('core-multiplayer', null, {
				id: 'feat-private-match',
				name: 'Private match'
			})
		];
		const { instance, behavior } = checker(features);
		const analysis = await instance.analyze('project-1');

		expect(behavior.loadFeature).toHaveBeenCalledWith('project-1', 'feat-private-match');
		expect(analysis.featureMaturity).toEqual({ 'feat-private-match': 0 });
		expect(analysis.gaps).toContainEqual(
			expect.objectContaining({
				id: 'gap-features-missing-kernel-snapshots',
				kind: 'dangling',
				blocking: true
			})
		);
	});
});
