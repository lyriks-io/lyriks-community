import { describe, expect, it } from 'vitest';
import { createTerm } from './draft';
import { computeGlossaryHealth, countTermUsages, suggestGlossaryTerms } from './vocabulary';

describe('counting where a governed term is used', () => {
	it('counts whole words in any case, the term and its allowed synonyms alike', () => {
		const order = createTerm({ term: 'Order', synonymsAllowed: ['purchase'] });
		expect(countTermUsages(order, 'An order is placed. ORDER again; a Purchase too.')).toBe(3);
	});

	it('never counts a term inside another word, accented words included', () => {
		expect(countTermUsages(createTerm({ term: 'order' }), 'reorder the orders')).toBe(0);
		expect(countTermUsages(createTerm({ term: 'commande' }), 'commandée, la commande')).toBe(1);
	});

	it('reads a term holding regex characters literally', () => {
		expect(countTermUsages(createTerm({ term: 'C++' }), 'Written in C++, not in Cxx.')).toBe(1);
		expect(countTermUsages(createTerm({ term: 'a.b' }), 'axb')).toBe(0);
	});

	it('counts nothing for an unnamed term or an empty corpus', () => {
		expect(countTermUsages(createTerm({ term: '  ' }), 'anything')).toBe(0);
		expect(countTermUsages(createTerm({ term: 'Order' }), '')).toBe(0);
	});
});

describe('the glossary health score', () => {
	it('weights defined terms at half, used terms at three tenths, and a clean corpus at the rest', () => {
		const terms = [
			createTerm({ term: 'Order', definition: 'A request to buy.', status: 'approved' }),
			createTerm({ term: 'Invoice', definition: 'What is owed.' }),
			createTerm({ term: 'Refund' }),
			createTerm({ term: 'Ledger', definition: 'The books.' })
		];
		expect(computeGlossaryHealth(terms, 'Each order produces an invoice.')).toEqual({
			total: 4,
			defined: 3,
			definedPct: 75,
			used: 2,
			usedPct: 50,
			approved: 1,
			approvedPct: 25,
			bannedInUse: 0,
			score: Math.round(75 * 0.5 + 50 * 0.3 + 100 * 0.2)
		});
	});

	it('takes a quarter of cleanliness for each distinct banned word found in the corpus, down to nothing', () => {
		const order = (avoid: string[]) => [createTerm({ term: 'Order', definition: 'x', synonymsAvoid: avoid })];
		const corpus = 'The basket, the cart, the bag, the hamper and the trolley; the Basket again.';
		expect(computeGlossaryHealth(order(['basket']), corpus)).toMatchObject({ bannedInUse: 1, score: Math.round(100 * 0.5 + 0 + 75 * 0.2) });
		expect(computeGlossaryHealth(order(['basket', 'cart', 'bag', 'hamper', 'trolley', 'tote']), corpus)).toMatchObject({ bannedInUse: 5, score: 50 });
		expect(computeGlossaryHealth(order(['tote']), corpus)).toMatchObject({ bannedInUse: 0, score: 70 });
	});

	it('counts a banned word once however many terms ban it, whatever its case', () => {
		const terms = [
			createTerm({ term: 'Order', definition: 'x', synonymsAvoid: ['Basket'] }),
			createTerm({ term: 'Cart line', definition: 'y', synonymsAvoid: ['basket'] })
		];
		expect(computeGlossaryHealth(terms, 'the basket').bannedInUse).toBe(1);
	});

	it('ignores terms left without a name, and scores an empty glossary 0', () => {
		expect(computeGlossaryHealth([createTerm({ term: ' ', definition: 'orphan' })], 'text')).toMatchObject({ total: 0, defined: 0, definedPct: 0, score: 0 });
	});
});

describe('the terms suggested from the brief', () => {
	it('suggests the domain words that recur, most frequent first, as display words', () => {
		const brief = 'Each courier picks a parcel. The courier scans the parcel, then the courier drops the parcel at a locker.';
		expect(suggestGlossaryTerms(brief, [])).toEqual([
			{ term: 'Courier', weight: 3 },
			{ term: 'Parcel', weight: 3 }
		]);
	});

	it('leaves out glue words, generic product nouns, short words and the words already governed', () => {
		const brief = 'users users feature feature with with box box parcel parcel courier courier drop-off drop-off';
		const governed = [createTerm({ term: 'Parcel', synonymsAvoid: ['courier'] })];
		expect(suggestGlossaryTerms(brief, governed).map((s) => s.term)).toEqual(['Drop-off']);
	});

	it('suggests a brand or an acronym seen once, keeping how it is written', () => {
		const brief = 'Payments go through PayPal and every company has a SIRET number. Monday matters.';
		expect(suggestGlossaryTerms(brief, [])).toEqual([
			{ term: 'PayPal', weight: 3 },
			{ term: 'SIRET', weight: 3 }
		]);
	});

	it('keeps the eight strongest candidates at most', () => {
		const words = ['alpha', 'bravo', 'charlie', 'delta', 'echoes', 'foxtrot', 'golfer', 'hotel', 'india', 'juliet'];
		const brief = words.flatMap((w, i) => Array.from({ length: words.length - i + 1 }, () => w)).join(' ');
		expect(suggestGlossaryTerms(brief, []).map((s) => s.term)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echoes', 'Foxtrot', 'Golfer', 'Hotel']);
	});
});
