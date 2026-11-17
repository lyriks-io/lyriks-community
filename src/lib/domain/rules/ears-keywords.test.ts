import { describe, expect, it } from 'vitest';
import { earsKeywordSpans, earsRunsWithin, readsAsEars, splitEarsKeywords } from './ears-keywords';

const keywords = (text: string) => splitEarsKeywords(text).filter((r) => r.keyword).map((r) => r.text);

describe('splitEarsKeywords', () => {
	it('marks every EARS keyword, whatever its case, and keeps the text whole', () => {
		const text = 'While the cart is open, when the user pays, IF the card is declined, Then the system SHALL refuse; Where offline, it shall wait.';
		const runs = splitEarsKeywords(text);
		expect(runs.map((r) => r.text).join('')).toBe(text);
		expect(keywords(text)).toEqual(['While', 'when', 'IF', 'Then', 'SHALL', 'Where', 'shall']);
	});

	it('matches whole words only', () => {
		expect(keywords('A shallow wherever whenever notify iffy thence awhile ifs')).toEqual([]);
		expect(keywords('shall_be when2')).toEqual([]);
	});

	it('matches keywords next to punctuation', () => {
		expect(keywords('(when) if, then. shall!')).toEqual(['when', 'if', 'then', 'shall']);
		expect(splitEarsKeywords('if,')).toEqual([
			{ text: 'if', keyword: true },
			{ text: ',', keyword: false }
		]);
	});

	it('gives nothing for an empty text, and one plain run without keywords', () => {
		expect(splitEarsKeywords('')).toEqual([]);
		expect(splitEarsKeywords('Nothing here.')).toEqual([{ text: 'Nothing here.', keyword: false }]);
	});
});

describe('the EARS keywords stand out in French too, never inside a quotation [criterion:5b984e4a]', () => {
	it('marks the words of the French template, elided or not', () => {
		expect(keywords('Lorsque l\'utilisateur déclenche l\'action « Payer », si « order.status » vaut « draft », alors le système doit la refuser.')).toEqual(['Lorsque', 'si', 'alors', 'doit']);
		expect(keywords('Tant que « subscription.status » ne vaut pas « draft », le système doit garantir que « subscription.itemCount » est supérieur à 0.')).toEqual(['Tant que', 'doit']);
		expect(keywords("Lorsqu'un événement déclenche l'action « Constater », s'il pleut, alors le système doit la refuser.")).toEqual(["Lorsqu'", "s'", 'alors', 'doit']);
		expect(keywords("Tant qu'il pleut, le système doit attendre.")).toEqual(["Tant qu'", 'doit']);
	});

	it('leaves a quoted state, value or message plain, in either language', () => {
		expect(keywords('alors afficher « Si le panier est vide, il doit être rempli. »')).toEqual(['alors']);
		expect(keywords('When the user asks to open, the system shall refuse to open and show "If in doubt, then wait."')).toEqual(['When', 'shall']);
		expect(keywords('if “when” is set')).toEqual(['if']);
	});

	it('matches French words whole: sinon, doigt, alorsque never', () => {
		expect(keywords('sinon doigt alorsque lorsques sil siège')).toEqual([]);
	});

	it('keeps a quotation plain when the text is cut into pieces, as the glossary cuts it', () => {
		const text = 'alors afficher « Si le Panier est vide » et le système doit attendre';
		const spans = earsKeywordSpans(text);
		const pieces = ['alors afficher « Si le ', 'Panier', ' est vide » et le système doit attendre'];
		let offset = 0;
		const runs = pieces.flatMap((piece) => {
			const out = earsRunsWithin(piece, offset, spans);
			offset += piece.length;
			return out;
		});
		expect(runs.filter((r) => r.keyword).map((r) => r.text)).toEqual(['alors', 'doit']);
		expect(runs.map((r) => r.text).join('')).toBe(text);
	});
});

describe('readsAsEars', () => {
	it('recognizes French requirement sentences', () => {
		expect(readsAsEars('Le système doit toujours garantir que « slot.subscriberCount » est au plus 8.')).toBe(true);
		expect(readsAsEars("Lorsqu'un événement déclenche l'action « Constater », alors le système doit la refuser.")).toBe(true);
		expect(readsAsEars('Tant que « x » vaut 1, le système doit garantir que « y » vaut 2.')).toBe(true);
		expect(readsAsEars('Un abonnement arrêté ne se relance pas.')).toBe(false);
	});

	it('recognizes requirement sentences and nothing else', () => {
		expect(readsAsEars('When the user asks to pay, the system shall refuse.')).toBe(true);
		expect(readsAsEars('The system shall always ensure that the total is positive.')).toBe(true);
		expect(readsAsEars('Scenario "Pay" of Checkout')).toBe(false);
		expect(readsAsEars('Checkout › action "Pay"')).toBe(false);
		expect(readsAsEars('')).toBe(false);
		expect(readsAsEars(null)).toBe(false);
	});
});
