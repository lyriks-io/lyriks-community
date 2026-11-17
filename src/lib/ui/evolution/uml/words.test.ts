import { describe, expect, it } from 'vitest';
import { alphabetical, diagramWords } from './words';

describe('the flows are listed in alphabetical order [criterion:ac-leaf-ac-evo-func-uml]', () => {
	it('orders the use cases of the demo the way a French reader looks them up', () => {
		const declared = ['Commander un gâteau sur mesure', 'Traiter une demande', "Payer l'acompte", 'Préparer et remettre le gâteau', 'Annuler une commande'];
		expect(alphabetical(declared, 'fr')).toEqual(['Annuler une commande', 'Commander un gâteau sur mesure', "Payer l'acompte", 'Préparer et remettre le gâteau', 'Traiter une demande']);
		expect(declared[0]).toBe('Commander un gâteau sur mesure');
	});

	it('never splits a letter by its accent or its case, and counts numbers as numbers', () => {
		expect(alphabetical(['étape 10', 'Etape 2', 'ezra', 'Été'], 'fr')).toEqual(['Etape 2', 'étape 10', 'Été', 'ezra']);
	});
});

describe('every field of the diagram shows its example in the spec language [criterion:ac-leaf-ac-evo-func-uml-edit]', () => {
	it('gives each field an example in English and in French', () => {
		for (const lang of ['en', 'fr'] as const) for (const example of Object.values(diagramWords(lang).examples)) expect(example.trim()).not.toBe('');
		expect(diagramWords('fr').examples.trigger).toBe('la cliente vient la chercher');
		expect(diagramWords('en').examples.trigger).toBe('the customer picks it up');
	});
});

describe('each view of a UML diagram is titled by what it draws [criterion:ac-leaf-ac-diag-title]', () => {
	it('names the product, the flow, the thing or the sequence shown, in the spec language', () => {
		const en = diagramWords('en').titles;
		expect(en.useCases('La Fournée')).toBe('Use cases: who uses La Fournée, and for what');
		expect(en.flow('Annuler une commande')).toBe('Flow of "Annuler une commande", step by step');
		expect(en.states('Abonnement')).toBe('States of "Abonnement": what it goes through');
		expect(en.sequence('Générer les commandes du jeudi')).toBe('Sequence "Générer les commandes du jeudi": who calls whom, in order');
		const fr = diagramWords('fr').titles;
		expect(fr.flow('Annuler une commande')).toBe('Déroulé de « Annuler une commande », pas à pas');
		expect(fr.states(null)).toBe('États : ce par quoi passe chaque chose');
		// Never a kind alone, and never two views under the same title.
		for (const lang of ['en', 'fr'] as const) {
			const t = diagramWords(lang).titles;
			const all = [t.useCases('P'), t.flow('X'), t.states('X'), t.components, t.sequence('X'), t.flow(null), t.states(null), t.sequence(null)];
			expect(new Set(all).size).toBe(all.length);
			for (const title of all) expect(title).toMatch(/[:,]/);
		}
	});
});
