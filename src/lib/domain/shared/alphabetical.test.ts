import { describe, expect, it } from 'vitest';
import { compareNames, sortByName } from './alphabetical';

describe('every list of names in the app reads in alphabetical order [criterion:4b3d2b4d]', () => {
	const named = (...names: string[]) => names.map((name) => ({ name }));

	it('sorts from A to Z, case and accents ignored, numbers read as numbers', () => {
		expect(sortByName(named('Réserver', 'piloter le parc', 'Écran de connexion', 'Feature 10', 'Feature 2')).map((x) => x.name)).toEqual([
			'Écran de connexion',
			'Feature 2',
			'Feature 10',
			'piloter le parc',
			'Réserver'
		]);
		expect(['Ventes', 'Achats et approvisionnements', 'Stocks'].sort(compareNames)).toEqual(['Achats et approvisionnements', 'Stocks', 'Ventes']);
	});

	it('reads the name each list shows, and never reorders what is stored', () => {
		const stored = [{ term: 'Salle' }, { term: 'Créneau' }];
		expect(sortByName(stored, (t) => t.term).map((t) => t.term)).toEqual(['Créneau', 'Salle']);
		expect(stored.map((t) => t.term)).toEqual(['Salle', 'Créneau']);
	});
});
