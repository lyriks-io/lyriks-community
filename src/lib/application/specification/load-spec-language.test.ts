import { describe, expect, it } from 'vitest';
import { createEmptyOperationsDraft } from '$domain/foundation';
import { LoadSpecLanguageUseCase } from './load-spec-language';

const withLocale = (primaryLocale: string) => ({
	loadOperations: async (projectId: string) => {
		const draft = createEmptyOperationsDraft(projectId);
		return { ...draft, i18n: { ...draft.i18n, primaryLocale } };
	}
});

const withDescriptions = (descriptions: string[]) => ({
	execute: async () =>
		({ features: descriptions.map((description) => ({ description })) }) as never
});

const FRENCH = [
	"Le joueur ne peut pas plonger quand la réserve d'air est vide et que le bateau est loin.",
	'Les animaux fuient le joueur qui court dans la forêt avec une torche pour la nuit.'
];

describe('LoadSpecLanguageUseCase', () => {
	it('reads the declared primary locale without looking at the prose', async () => {
		const reading = await new LoadSpecLanguageUseCase(withLocale('fr-FR'), {
			execute: async () => {
				throw new Error('the prose is not read when a language is declared');
			}
		}).execute('p');
		expect(reading).toMatchObject({ language: 'fr', declared: true, generated: 'fr' });
	});

	it('stays in English when nothing is declared, and says the prose reads French', async () => {
		const reading = await new LoadSpecLanguageUseCase(withLocale(''), withDescriptions(FRENCH)).execute('p');
		expect(reading).toMatchObject({ language: 'en', declared: false, generated: 'en' });
		expect(reading.notice).toMatch(/French/);
	});

	it('reads the declared language alone for the generated texts', async () => {
		const useCase = new LoadSpecLanguageUseCase(withLocale('fr-CA'), {
			execute: async () => {
				throw new Error('never read');
			}
		});
		expect(await useCase.generated('p')).toBe('fr');
		expect(await new LoadSpecLanguageUseCase(withLocale('de'), withDescriptions([])).generated('p')).toBe('en');
	});

	it('says so when the prose reads clearly in the other language than the one declared, from features at hand', async () => {
		const useCase = new LoadSpecLanguageUseCase(withLocale('en'), {
			execute: async () => {
				throw new Error('the features at hand are used, not read again');
			}
		});
		const features = { features: FRENCH.map((description) => ({ description })) } as never;
		const reading = await useCase.execute('p', features);
		expect(reading).toMatchObject({ language: 'en', declared: true, generated: 'en' });
		expect(reading.notice).toMatch(/declared in English, while its prose reads as French/);
		// A read in flight is accepted as well.
		expect((await useCase.execute('p', Promise.resolve(features))).notice).toMatch(/French/);
		// Without the features, a declared language never costs a read of the draft.
		expect((await useCase.execute('p')).notice).toBeNull();
		// Prose in the declared language says nothing.
		const french = await new LoadSpecLanguageUseCase(withLocale('fr'), withDescriptions([])).execute('p', features);
		expect(french.notice).toBeNull();
	});

	it('detects the prose once for the same text', async () => {
		let reads = 0;
		const useCase = new LoadSpecLanguageUseCase(withLocale(''), {
			execute: async () => {
				reads += 1;
				return { features: FRENCH.map((description) => ({ description })) } as never;
			}
		});
		const first = await useCase.execute('p');
		const second = await useCase.execute('p');
		expect(second).toEqual(first);
		expect(reads).toBe(2);
	});
});
