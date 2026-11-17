import { describe, expect, it } from 'vitest';
import { pointsOf, proseStatements, statementCount, textOfPoints } from './prose-statements';

/** The texts of the steps of prose read as lists, never as one block (ac-evo-form-prose-as-list). */
describe('a text of a step of prose reads as its statements [criterion:ac-leaf-ac-evo-form-prose-as-list]', () => {
	it('cuts a block into its sentences, so what the product refuses reads one refusal per bullet', () => {
		const refusals =
			"Pas de commande pour un retrait à moins de 48 heures : le client voit la première date possible. Pas plus de six gâteaux sur mesure par jour : une date pleine n'est plus proposée. Le pâtissier peut refuser une demande qu'il ne sait pas faire, avec une raison que le client lit. Pas d'annulation remboursée à moins de 72 heures du retrait.";
		expect(proseStatements(refusals)).toEqual([
			[
				'Pas de commande pour un retrait à moins de 48 heures : le client voit la première date possible.',
				"Pas plus de six gâteaux sur mesure par jour : une date pleine n'est plus proposée.",
				"Le pâtissier peut refuser une demande qu'il ne sait pas faire, avec une raison que le client lit.",
				"Pas d'annulation remboursée à moins de 72 heures du retrait."
			]
		]);
	});

	it('keeps one statement per line, sets aside a typed marker, and keeps paragraphs apart', () => {
		expect(proseStatements('- first thing\n* second thing\n\n1. third thing. Fourth thing!')).toEqual([['first thing', 'second thing'], ['third thing.', 'Fourth thing!']]);
	});

	it('never cuts inside a number, a quotation or a citation of the product', () => {
		expect(proseStatements('Le SMS coûte 0,05 €. Le client voit « aucun numéro enregistré ». Voir @[Commandes du jour](feature:feat-orders).')).toEqual([
			['Le SMS coûte 0,05 €.', 'Le client voit « aucun numéro enregistré ».', 'Voir @[Commandes du jour](feature:feat-orders).']
		]);
	});

	it('leaves a text saying one thing as one sentence', () => {
		expect(statementCount(proseStatements('Le boulanger marque le sac prêt.'))).toBe(1);
		expect(statementCount(proseStatements('   '))).toBe(0);
	});
});

describe('an answer read as a list is edited point by point [criterion:ac-leaf-ac-evo-form-list-edit]', () => {
	it('opens a text as its points and saves the points as one per line, never cut again', () => {
		const points = pointsOf('Pas de commande à moins de 48 heures. Pas plus de six gâteaux par jour.\n\nPas d\'annulation remboursée.');
		expect(points).toEqual(['Pas de commande à moins de 48 heures.', 'Pas plus de six gâteaux par jour.', "Pas d'annulation remboursée."]);
		// A point edited into two sentences stays one point: the list is saved as edited.
		const edited = [...points, '  ', 'Le dimanche, pas de retrait. Le lundi non plus.'];
		expect(textOfPoints(edited)).toBe("Pas de commande à moins de 48 heures.\nPas plus de six gâteaux par jour.\nPas d'annulation remboursée.\nLe dimanche, pas de retrait. Le lundi non plus.");
		expect(textOfPoints(['a\nb'])).toBe('a b');
		// Read again, the saved list holds exactly the points edited.
		expect(pointsOf(textOfPoints(edited))).toEqual([...points, 'Le dimanche, pas de retrait. Le lundi non plus.']);
	});
});
