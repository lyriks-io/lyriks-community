import { describe, expect, it } from 'vitest';
import { termIdBase, uniqueTermId } from './term-id';

describe('the id a bare term is given (criterion c7afe419)', () => {
	it('is made from the word, the same word giving the same id', () => {
		expect(termIdBase('Invoice status')).toBe('term-invoice-status');
		expect(termIdBase('  Invoice   status ')).toBe('term-invoice-status');
		expect(termIdBase('Invoice-to-cash')).toBe('term-invoice-to-cash');
	});

	it('drops accents and keeps the letters of a script without them', () => {
		expect(termIdBase('Réservation')).toBe('term-reservation');
		expect(termIdBase('Bon de commande')).toBe('term-bon-de-commande');
		expect(termIdBase('予約')).toBe('term-予約');
	});

	it('has nothing to make an id from when the word holds no letter or digit', () => {
		expect(termIdBase('')).toBeNull();
		expect(termIdBase('   ')).toBeNull();
		expect(termIdBase('!!! --')).toBeNull();
	});

	it('stays readable when a whole sentence was typed as the word', () => {
		const id = termIdBase('A very long sentence typed into the term field instead of the definition one');
		expect(id).not.toBeNull();
		expect(id!.length).toBeLessThanOrEqual('term-'.length + 60);
		expect(id!.endsWith('-')).toBe(false);
	});

	it('takes -2, -3 when the id is already held', () => {
		expect(uniqueTermId('term-invoice', new Set())).toBe('term-invoice');
		expect(uniqueTermId('term-invoice', new Set(['term-invoice']))).toBe('term-invoice-2');
		expect(uniqueTermId('term-invoice', new Set(['term-invoice', 'term-invoice-2']))).toBe('term-invoice-3');
	});
});
