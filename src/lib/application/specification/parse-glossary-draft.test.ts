import { describe, expect, it } from 'vitest';
import { parseGlossaryWrite } from './parse-glossary-draft';

describe('a glossary write keeps the terms sent without an id (criterion c7afe419)', () => {
	it('gives each bare term an id made from its word and reports it', () => {
		const { draft, assignedTermIds } = parseGlossaryWrite(
			{ terms: [{ term: 'Bookmark', definition: 'A saved link.' }, { term: 'Tag' }] },
			'p1'
		);
		expect(draft.terms.map((t) => [t.id, t.term, t.definition])).toEqual([
			['term-bookmark', 'Bookmark', 'A saved link.'],
			['term-tag', 'Tag', '']
		]);
		expect(assignedTermIds).toEqual([
			{ id: 'term-bookmark', term: 'Bookmark' },
			{ id: 'term-tag', term: 'Tag' }
		]);
	});

	it('never reuses an id the payload holds, even on a term that comes later', () => {
		const { draft, assignedTermIds } = parseGlossaryWrite(
			{ terms: [{ term: 'Tag' }, { term: 'Tag' }, { id: 'term-tag', term: 'Label' }] },
			'p1'
		);
		expect(draft.terms.map((t) => t.id)).toEqual(['term-tag-2', 'term-tag-3', 'term-tag']);
		expect(assignedTermIds.map((a) => a.id)).toEqual(['term-tag-2', 'term-tag-3']);
	});

	it('keeps the ids a client sent, and reports nothing when it sent them all', () => {
		const { draft, assignedTermIds } = parseGlossaryWrite(
			{ terms: [{ id: 't1', term: 'Bookmark', status: 'approved', locale: 'fr' }] },
			'p1'
		);
		expect(draft.terms).toEqual([
			{
				id: 't1',
				term: 'Bookmark',
				definition: '',
				synonymsAllowed: [],
				synonymsAvoid: [],
				example: '',
				locale: 'fr',
				status: 'approved',
				sourceIds: []
			}
		]);
		expect(assignedTermIds).toEqual([]);
	});

	it('leaves out a bare term with nothing to make an id from (the save refuses it first)', () => {
		const { draft, assignedTermIds } = parseGlossaryWrite({ terms: [{ term: '!!!' }, { definition: 'orphan' }] }, 'p1');
		expect(draft.terms).toEqual([]);
		expect(assignedTermIds).toEqual([]);
	});

	it('pins the project and survives a payload that is not an object', () => {
		expect(parseGlossaryWrite(null, 'p1')).toEqual({
			draft: { projectId: 'p1', terms: [], lastSavedAt: null },
			assignedTermIds: []
		});
		expect(parseGlossaryWrite({ projectId: 'other', terms: [] }, 'p1').draft.projectId).toBe('p1');
	});
});
