import { describe, expect, it } from 'vitest';
import { computeDataCoherence, createEmptyDataDraft, createEntity, type ProjectDataDraft } from '$domain/data';
import { computeExperienceCoherence, createEmptyExperienceDraft, type ProjectExperienceDraft } from '$domain/experience';
import { computeFeaturesCoherence, createEmptyFeaturesDraft, createFeature, type ProjectFeaturesDraft } from '$domain/features';
import type { DataDraftRepositoryPort, ExperienceDraftRepositoryPort, FeaturesDraftRepositoryPort, TelemetryPort } from '../ports';
import { SaveDataDraftUseCase } from './save-data-draft';
import { SaveExperienceDraftUseCase } from './save-experience-draft';
import { SaveFeaturesDraftUseCase } from './save-features-draft';

const NOW = '2026-11-18T09:00:00.000Z';
const clock = { nowIso: () => NOW };
const telemetry: TelemetryPort = { emit: () => {} };

describe('saving the Experience section', () => {
	function save(warnings: string[] | null) {
		const saved: ProjectExperienceDraft[] = [];
		const drafts = {
			load: async () => null,
			save: async (d: ProjectExperienceDraft) => (saved.push(d), warnings === null ? undefined : { behaviorWarnings: warnings })
		} satisfies ExperienceDraftRepositoryPort;
		return { saved, useCase: new SaveExperienceDraftUseCase(drafts, clock, telemetry, async () => 'fr') };
	}

	it('stores it stamped and answers its coherence in the spec language, with what the kernel merge dropped', async () => {
		const { saved, useCase } = save(['The surface "Wizard" exists only in the engine and was dropped.']);
		const result = await useCase.execute(createEmptyExperienceDraft('p1'));
		const french = computeExperienceCoherence({ ...createEmptyExperienceDraft('p1'), lastSavedAt: NOW }, 'fr');
		expect(saved.map((d) => d.lastSavedAt)).toEqual([NOW]);
		expect(result).toEqual({
			savedAt: NOW,
			coherenceScore: french.score,
			coherenceIssues: french.issues.map((i) => i.message),
			behaviorWarnings: ['The surface "Wizard" exists only in the engine and was dropped.']
		});
	});

	it('reports no merge loss when the store has nothing to say', async () => {
		expect((await save(null).useCase.execute(createEmptyExperienceDraft('p1'))).behaviorWarnings).toEqual([]);
	});
});

describe('saving the Features section', () => {
	it('stores it stamped, and answers its coherence and the broken links it kept', async () => {
		const saved: ProjectFeaturesDraft[] = [];
		const drafts = { load: async () => null, save: async (d: ProjectFeaturesDraft) => void saved.push(d) } satisfies FeaturesDraftRepositoryPort;
		const draft = { ...createEmptyFeaturesDraft('p1'), features: [createFeature('core-gone', null, { id: 'f1', name: 'Pay' })] };

		const result = await new SaveFeaturesDraftUseCase(drafts, clock, telemetry).execute(draft, 'en');
		expect(saved.map((d) => d.lastSavedAt)).toEqual([NOW]);
		expect(result.coherenceScore).toBe(computeFeaturesCoherence({ ...draft, lastSavedAt: NOW }).score);
		expect(result.warnings.map((w) => [w.code, w.ref])).toEqual([['dangling-core-ref', 'f1']]);
	});
});

describe('saving the Data section', () => {
	it('stores it stamped without the derived mirror, tells what depends on it, and answers its coherence', async () => {
		const saved: ProjectDataDraft[] = [];
		const told: string[] = [];
		const drafts = { load: async () => null, save: async (d: ProjectDataDraft) => void saved.push(d) } satisfies DataDraftRepositoryPort;
		const draft: ProjectDataDraft = {
			...createEmptyDataDraft('p1'),
			entities: [createEntity({ id: 'e1', name: 'Order' })],
			derivedEntities: [{ name: 'Mirror', fields: ['total'] }]
		};

		const result = await new SaveDataDraftUseCase(drafts, clock, telemetry, async () => 'en', (projectId) => told.push(projectId)).execute(draft);
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ lastSavedAt: NOW, derivedEntities: [], entities: draft.entities });
		expect(told).toEqual(['p1']);
		expect(result.coherenceScore).toBe(computeDataCoherence(draft).score);
	});
});
