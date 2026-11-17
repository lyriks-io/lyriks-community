import { describe, expect, it, vi } from 'vitest';
import { createEmptyArchitectureDraft } from '$domain/architecture';
import { createEmptyDataDraft } from '$domain/data';
import { createEmptyExperienceDraft } from '$domain/experience';
import { createCore, createEmptyFeaturesDraft, createFeature } from '$domain/features';
import {
	createEmptyDefinitionDraft,
	createEmptyIdentityDraft,
	createEmptyOperationsDraft
} from '$domain/foundation';
import { createEmptyGlossaryDraft } from '$domain/glossary';
import { createEmptyRulesDraft } from '$domain/rules';
import { createEmptyUsersDraft } from '$domain/users';
import { LOCAL_CHECK_IDS, PROSE_LANGUAGE_CHECK_ID } from '$domain/coherence';
import { NBSP } from '$domain/language';
import { LocalGlobalCoherenceChecker } from './local-global-coherence-checker';

const loader = <T>(value: T) => ({ execute: vi.fn(async () => value) });

const FRENCH_DESCRIPTION =
	"Le joueur crée une partie privée et la partage avec ses amis pour qu'ils la rejoignent dans le salon.";
const ENGLISH_DESCRIPTION =
	'The player creates a private match and shares it with the friends that can join it from the lobby.';

function checker(primaryLocale: string, description: string, snapshot: Record<string, unknown> | null = null) {
	const features = createEmptyFeaturesDraft('project-1');
	features.cores = [createCore({ id: 'core-multiplayer', name: 'Multiplayer' })];
	features.features = [
		createFeature('core-multiplayer', null, { id: 'feat-private-match', name: 'Private match', description })
	];
	const operations = createEmptyOperationsDraft('project-1');
	operations.i18n.primaryLocale = primaryLocale;
	const foundation = {
		loadIdentity: vi.fn(async () => createEmptyIdentityDraft('project-1')),
		loadDefinition: vi.fn(async () => createEmptyDefinitionDraft('project-1')),
		loadOperations: vi.fn(async () => operations)
	};
	return new LocalGlobalCoherenceChecker(
		foundation as never,
		loader(createEmptyUsersDraft('project-1')) as never,
		loader(features) as never,
		loader(createEmptyExperienceDraft('project-1')) as never,
		loader(createEmptyRulesDraft('project-1')) as never,
		loader(createEmptyDataDraft('project-1')) as never,
		loader(createEmptyArchitectureDraft('project-1')) as never,
		loader(createEmptyGlossaryDraft('project-1')) as never,
		{ loadFeature: vi.fn(async () => (snapshot ? { feature: snapshot } : null)) } as never,
		{ score: (s: unknown) => (s ? 90 : 0) } as never
	);
}

describe('the Control Center in the spec language (382e5227)', () => {
	it('stays in English when no language is declared', async () => {
		const analysis = await checker('', ENGLISH_DESCRIPTION).analyze('project-1');
		const missing = analysis.gaps.find((g) => g.id === 'gap-features-missing-kernel-snapshots');
		expect(missing?.title).toBe('1 feature has no behavior record to build from');
		expect(analysis.dimensions.find((d) => d.key === 'maturity')?.label).toBe('Behavior maturity');
		expect(analysis.checksRun).toEqual([...LOCAL_CHECK_IDS]);
	});

	it('writes every card and dimension in French when the spec is French', async () => {
		const analysis = await checker('fr-FR', FRENCH_DESCRIPTION).analyze('project-1');
		const missing = analysis.gaps.find((g) => g.id === 'gap-features-missing-kernel-snapshots');
		expect(missing?.title).toBe(
			"1 fonctionnalité n'a aucun enregistrement de comportement à partir duquel construire"
		);
		expect(missing?.kindLabel).toBe('Enregistrement de comportement manquant');
		expect(analysis.dimensions.find((d) => d.key === 'maturity')?.label).toBe('Maturité du comportement');
		expect(analysis.dimensions.find((d) => d.key === 'features')?.label).toBe('Fonctionnalités');
		// The gap keeps its key whatever the language, so a decision on it stands.
		expect(analysis.gaps.map((g) => g.id)).toContain('gap-features-missing-kernel-snapshots');
	});
});

describe('prose in another language than the spec (80ad0a4c)', () => {
	it('lists each piece, where it lives and the language it reads in, on one non-blocking card', async () => {
		const snapshot = {
			id: 'feat-private-match',
			name: 'Private match',
			surfaces: [
				{
					name: 'Lobby',
					actions: [
						{
							name: 'createMatch',
							intent: 'Crée une partie privée pour le joueur qui est dans le salon avec ses amis et les invite.',
							scenarios: [{ name: 'host opens a match' }]
						}
					]
				}
			]
		};
		const analysis = await checker('en', FRENCH_DESCRIPTION, snapshot).analyze('project-1');
		const card = analysis.gaps.find((g) => g.id === 'gap-language-prose-drift');
		expect(card).toMatchObject({ checkId: PROSE_LANGUAGE_CHECK_ID, blocking: false, severity: 'low' });
		expect(card?.title).toBe("2 texts in the model read in another language than the spec's (English)");
		expect(card?.detail).toContain('Feature "Private match", description (reads in French)');
		expect(card?.detail).toContain('Feature "Private match", action "createMatch", action description (reads in French)');
		// A name the code carries and a text too short to tell are never flagged.
		expect(card?.detail).not.toContain('host opens a match');
		expect(analysis.checksRun).toContain(PROSE_LANGUAGE_CHECK_ID);
	});

	it('says it in French when the spec is French', async () => {
		const analysis = await checker('fr', ENGLISH_DESCRIPTION).analyze('project-1');
		const card = analysis.gaps.find((g) => g.id === 'gap-language-prose-drift');
		expect(card?.title).toBe('1 texte du modèle se lit dans une autre langue que celle de la spec (français)');
		expect(card?.detail).toContain(`La spec est écrite en français${NBSP}; ce texte ne l'est pas${NBSP}:`);
		expect(card?.detail).toContain(
			`Fonctionnalité «${NBSP}Private match${NBSP}», description (en anglais)${NBSP}: `
		);
	});

	it('reads nothing when the project declares no language, or when the prose matches it', async () => {
		const undeclared = await checker('', FRENCH_DESCRIPTION).analyze('project-1');
		expect(undeclared.gaps.find((g) => g.id === 'gap-language-prose-drift')).toBeUndefined();
		expect(undeclared.checksRun).not.toContain(PROSE_LANGUAGE_CHECK_ID);
		const matching = await checker('fr', FRENCH_DESCRIPTION).analyze('project-1');
		expect(matching.gaps.find((g) => g.id === 'gap-language-prose-drift')).toBeUndefined();
	});
});
