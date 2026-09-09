import { describe, expect, it } from 'vitest';
import { brokenCitations, citationCount, citedSources, toggleCitation } from './citation';
import { createDocumentSource, type DocumentSource } from './draft';

const source = (id: string): DocumentSource => createDocumentSource({ id, title: id });
const REGISTER = [source('a'), source('b'), source('c')];

describe('toggleCitation', () => {
	it('appends, removes, and never duplicates', () => {
		expect(toggleCitation(undefined, 'a')).toEqual(['a']);
		expect(toggleCitation(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleCitation(['a', 'b'], 'a')).toEqual(['b']);
		expect(toggleCitation(toggleCitation(['a'], 'a'), 'a')).toEqual(['a']);
	});

	it('leaves the input list untouched', () => {
		const before = ['a'];
		toggleCitation(before, 'b');
		expect(before).toEqual(['a']);
	});
});

describe('resolving citations against the register', () => {
	it('returns cited rows in register order, not citation order', () => {
		expect(citedSources(['c', 'a'], REGISTER).map((s) => s.id)).toEqual(['a', 'c']);
	});

	it('surfaces citations whose source was deleted instead of dropping them', () => {
		expect(brokenCitations(['a', 'gone'], REGISTER)).toEqual(['gone']);
		// The count is live evidence only — a broken link must not inflate it.
		expect(citationCount(['a', 'gone'], REGISTER)).toBe(1);
	});

	it('treats an absent citation list as no citations', () => {
		expect(citedSources(undefined, REGISTER)).toEqual([]);
		expect(brokenCitations(undefined, REGISTER)).toEqual([]);
		expect(citationCount(undefined, REGISTER)).toBe(0);
	});
});
