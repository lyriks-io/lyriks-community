import { describe, expect, it } from 'vitest';
import { insertMention, mentionedRefs, mentionToken, openMention, pickMentions, plainText, textPieces } from './mentions';

describe('a text of the Functional spec cites the product (ac-evo-func-mention)', () => {
	it('reads prose and citations in order, and the same token an AI client writes', () => {
		const text = `The organiser books with ${mentionToken('Réserver une salle', 'feature:feat-book')} and sees ${mentionToken('Booking dialog', 'screen:scr-book')}.`;
		expect(textPieces(text)).toEqual([
			{ kind: 'text', text: 'The organiser books with ' },
			{ kind: 'mention', name: 'Réserver une salle', ref: 'feature:feat-book' },
			{ kind: 'text', text: ' and sees ' },
			{ kind: 'mention', name: 'Booking dialog', ref: 'screen:scr-book' },
			{ kind: 'text', text: '.' }
		]);
		expect(mentionedRefs(`${text} ${mentionToken('Réserver une salle', 'feature:feat-book')}`)).toEqual(['feature:feat-book', 'screen:scr-book']);
		expect(plainText(text)).toBe('The organiser books with Réserver une salle and sees Booking dialog.');
	});

	it('opens a citation on an @ that starts a word, never inside an e-mail address', () => {
		expect(openMention('Ask @Rés', 8)).toEqual({ start: 4, query: 'Rés' });
		expect(openMention('Write to ana@lyriks.io', 22)).toBeNull();
		expect(openMention('No citation here', 16)).toBeNull();
	});

	it('replaces what is typed by the token of the picked element and puts the caret after it', () => {
		const typed = 'Book @Rés then confirm';
		const done = insertMention(typed, 5, 9, 'Réserver une salle', 'feature:feat-book');
		expect(done.text).toBe('Book @[Réserver une salle](feature:feat-book) then confirm');
		expect(done.text.slice(0, done.caret)).toBe('Book @[Réserver une salle](feature:feat-book)');
		expect(insertMention('See @Bo', 4, 7, 'Booking dialog', 'screen:s1').text).toBe('See @[Booking dialog](screen:s1) ');
	});
});

describe('the picker offers what the name holds', () => {
	const all = [
		{ ref: 'rule:r1', kind: 'rule' as const, name: 'Salle libre seulement', href: null },
		{ ref: 'feature:f1', kind: 'feature' as const, name: 'Réserver une salle', href: '/f1' },
		{ ref: 'term:t1', kind: 'term' as const, name: 'Salle', href: '/g' },
		{ ref: 'screen:s1', kind: 'screen' as const, name: 'Booking dialog', href: '/s1' }
	];
	it('puts the names that start with what is typed first, then features before screens, terms and rules', () => {
		expect(pickMentions(all, { q: 'sal' }).map((c) => c.ref)).toEqual(['term:t1', 'rule:r1', 'feature:f1']);
	});
	it('resolves the cited elements that still exist, and only those', () => {
		expect(pickMentions(all, { refs: ['feature:f1', 'feature:gone'] }).map((c) => c.ref)).toEqual(['feature:f1']);
	});
});
