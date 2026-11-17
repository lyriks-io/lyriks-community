import { describe, expect, it } from 'vitest';
import { proseLanguage, specLanguage } from './spec-language';

describe('the language a spec is written in', () => {
	it('is the declared primary locale, its generated texts in it when a template exists', () => {
		expect(specLanguage('fr-FR')).toEqual({ language: 'fr', declared: true, generated: 'fr', notice: null });
		expect(specLanguage('en')).toMatchObject({ language: 'en', declared: true, generated: 'en', notice: null });
	});

	it('is English when nothing is declared, and says so only when the prose reads otherwise', () => {
		expect(specLanguage('')).toEqual({ language: 'en', declared: false, generated: 'en', notice: null });
		const told = specLanguage(undefined, 'fr');
		expect(told).toMatchObject({ language: 'en', declared: false, generated: 'en' });
		expect(told.notice).toMatch(/No language is declared.*French.*Declare the primary language/);
	});

	it('tells a declared language whose prose reads in the other one, without switching', () => {
		const reading = specLanguage('en', 'fr');
		expect(reading).toMatchObject({ language: 'en', declared: true, generated: 'en' });
		expect(reading.notice).toMatch(/declared in English, while its prose reads as French/);
		expect(specLanguage('fr', 'fr').notice).toBeNull();
	});

	it('keeps a declared language without a template, generating in English with a notice', () => {
		const german = specLanguage('de-AT');
		expect(german).toMatchObject({ language: 'de', declared: true, generated: 'en' });
		expect(german.notice).toMatch(/German.*read in English/);
	});
});

describe('the language prose reads in', () => {
	it('tells French from English', () => {
		expect(
			proseLanguage([
				"Le joueur ne peut pas plonger quand la réserve d'air est vide et que le bateau est loin.",
				'Les animaux fuient le joueur qui court dans la forêt avec une torche pour la nuit.'
			])
		).toBe('fr');
		expect(
			proseLanguage([
				'The player cannot dive when the air supply is empty and the boat is far away.',
				'Animals flee the player who runs in the forest with a torch for the night, and that is it.'
			])
		).toBe('en');
	});

	it('says nothing on too little prose', () => {
		expect(proseLanguage(['Le joueur'])).toBeNull();
	});
});
