import { describe, expect, it } from 'vitest';
import { computeGlossaryCoherence, createEmptyGlossaryDraft, type ProjectGlossaryDraft } from '$domain/glossary';
import type { SpecLanguage } from '$domain/language';
import type { TelemetryEvent } from '../ports';
import { SaveSimpleSectionDraftUseCase, type SimpleSectionSaveHooks } from './save-simple-section-draft';

function setup(hooks: SimpleSectionSaveHooks<ProjectGlossaryDraft>, revision: number | null = 3) {
	const saved: ProjectGlossaryDraft[] = [];
	const events: TelemetryEvent[] = [];
	const useCase = new SaveSimpleSectionDraftUseCase<ProjectGlossaryDraft>(
		'glossary',
		{ save: async (draft) => (revision === null ? null : (saved.push(draft), revision)) },
		{ nowIso: () => '2026-11-18T06:00:00.000Z' },
		{ emit: (event) => void events.push(event) },
		hooks
	);
	return { useCase, saved, events };
}

const spokenIn = (languages: Record<string, SpecLanguage>) => {
	const asked: string[] = [];
	return { asked, languageOf: async (projectId: string) => (asked.push(projectId), languages[projectId] ?? 'en') };
};

describe('saving a simple section', () => {
	it('answers with the coherence messages in the language of the spec being saved', async () => {
		const languages = spokenIn({ fr1: 'fr', en1: 'en' });
		const { useCase } = setup({ coherence: computeGlossaryCoherence, languageOf: languages.languageOf });

		const fr = await useCase.execute(createEmptyGlossaryDraft('fr1'));
		const en = await useCase.execute(createEmptyGlossaryDraft('en1'));

		expect(languages.asked).toEqual(['fr1', 'en1']);
		expect(fr?.coherenceIssues).toEqual(computeGlossaryCoherence(createEmptyGlossaryDraft('fr1'), 'fr').issues.map((i) => i.message));
		expect(en?.coherenceIssues).toEqual(computeGlossaryCoherence(createEmptyGlossaryDraft('en1'), 'en').issues.map((i) => i.message));
		expect(fr?.coherenceIssues).not.toEqual(en?.coherenceIssues);
	});

	it('stores the draft stamped and reports the score it emitted', async () => {
		const { useCase, saved, events } = setup({ coherence: computeGlossaryCoherence, languageOf: async () => 'en' });
		const result = await useCase.execute(createEmptyGlossaryDraft('p1'));
		expect(saved.map((d) => d.lastSavedAt)).toEqual(['2026-11-18T06:00:00.000Z']);
		expect(result).toMatchObject({ savedAt: '2026-11-18T06:00:00.000Z', revision: 3, coherenceScore: 0 });
		expect(events.map((e) => e.type)).toEqual(['glossary.autosaved', 'glossary.local_coherence.computed']);
	});

	it('neither scores nor asks the language of a section that has no coherence fold', async () => {
		const { useCase } = setup({});
		expect(await useCase.execute(createEmptyGlossaryDraft('p1'))).toEqual({ savedAt: '2026-11-18T06:00:00.000Z', revision: 3 });
	});

	it('answers null and announces nothing when the draft changed elsewhere since it was read', async () => {
		const languages = spokenIn({});
		const { useCase, events } = setup({ coherence: computeGlossaryCoherence, languageOf: languages.languageOf }, null);
		expect(await useCase.execute(createEmptyGlossaryDraft('p1'))).toBeNull();
		expect(events).toEqual([]);
		expect(languages.asked).toEqual([]);
	});

	it('refuses, at compile time, a coherence fold wired without the spec language', () => {
		// @ts-expect-error a fold without languageOf would answer in English whatever the spec's language
		const hooks: SimpleSectionSaveHooks<ProjectGlossaryDraft> = { coherence: computeGlossaryCoherence };
		expect(hooks).toBeDefined();
	});
});
