import { describe, expect, it } from 'vitest';
import { parseDocumentsDraft } from '$application/specification/parse-documents-draft';
import { citePassages, locateWords, markPassages, passagesOf, type ProjectDocumentsDraft } from '$domain/documents';

const PAGE = 'Workflow\n\nA project holds between 2 and 12 statuses,\nin three categories: To do, In progress, Done.\nOnly a workspace admin may archive a project.';

const register = (stored = true): ProjectDocumentsDraft => ({
	projectId: 'taskora',
	lastSavedAt: null,
	sources: [
		{ id: 'src-fs-projects', title: 'Functional spec: Projects', kind: 'link', url: 'https://confluence/x', note: '', ...(stored ? { stored: { id: 'st-1', hash: 'fnv1a-1' } } : {}) },
		{ id: 'src-other', title: 'Other page', kind: 'link', url: 'https://confluence/y', note: '' }
	]
});

let n = 0;
const newId = () => `p${++n}`;
const textOf = (id: string) => (id === 'src-fs-projects' ? PAGE : null);

describe('one source, one id: the register names the text Unspag stores [criterion:81dffe4f]', () => {
	it('keeps the reference to the stored text, never its bytes, and reads it back', () => {
		const parsed = parseDocumentsDraft(JSON.parse(JSON.stringify(register())), 'taskora');
		expect(parsed.sources[0].stored).toEqual({ id: 'st-1', hash: 'fnv1a-1' });
		expect(JSON.stringify(parsed)).not.toContain('between 2 and 12');
		expect(parsed.sources[1].stored).toBeUndefined();
	});
});

describe('a citation names the passage an element rests on [criterion:f09da92d]', () => {
	it('finds the words in the stored text, line breaks and double spaces aside', () => {
		expect(locateWords(PAGE, 'between 2 and 12 statuses')).toEqual({ start: PAGE.indexOf('between'), end: PAGE.indexOf('statuses') + 'statuses'.length });
		const across = locateWords(PAGE, 'statuses, in three  categories');
		expect(across && PAGE.slice(across.start, across.end)).toBe('statuses,\nin three categories');
		expect(locateWords(PAGE, 'between two and twelve statuses')).toBeNull();
		expect(locateWords(PAGE, '   ')).toBeNull();
	});

	it('records each passage at its place, with the words as the source reads them, and refuses by name what it cannot place', () => {
		const out = citePassages(
			register(),
			[
				{ sourceId: 'src-fs-projects', anchor: 'feature:feat-tkr-workflow', words: 'statuses, in three categories', takes: 'Statuses fall in three categories.' },
				{ sourceId: 'src-fs-projects', anchor: 'rule:feat-tkr-projects:archive', words: 'two to twelve statuses', takes: 'x' },
				{ sourceId: 'src-other', anchor: 'role:admin', words: 'admin', takes: 'Who archives.' },
				{ sourceId: 'src-nope', anchor: 'role:admin', words: 'admin', takes: 'Who archives.' },
				{ sourceId: 'src-fs-projects', anchor: 'role:admin', words: 'workspace admin', takes: '  ' }
			],
			textOf,
			newId
		);
		expect(out.recorded).toHaveLength(1);
		expect(out.recorded[0]).toMatchObject({ sourceId: 'src-fs-projects', anchor: 'feature:feat-tkr-workflow', words: 'statuses,\nin three categories', takes: 'Statuses fall in three categories.' });
		expect(out.refused.map((r) => r.reason)).toEqual([
			expect.stringContaining('not in the stored text of "Functional spec: Projects", word for word'),
			expect.stringContaining('The text of "Other page" is not stored'),
			expect.stringContaining('No source of the register has the id "src-nope"'),
			expect.stringContaining('what the element took')
		]);
		expect(passagesOf(out.draft, 'feature:feat-tkr-workflow')).toHaveLength(1);
	});

	it('rewrites a passage cited again at the same place for the same element, never doubles it', () => {
		const first = citePassages(register(), [{ sourceId: 'src-fs-projects', anchor: 'role:admin', words: 'Only a workspace admin', takes: 'Who archives.' }], textOf, newId);
		const again = citePassages(first.draft, [{ sourceId: 'src-fs-projects', anchor: 'role:admin', words: 'Only a workspace admin', takes: 'Only an admin archives a project.' }], textOf, newId);
		expect(again.draft.passages).toHaveLength(1);
		expect(again.draft.passages?.[0]).toMatchObject({ id: first.recorded[0].id, takes: 'Only an admin archives a project.' });
	});

	it('reads back as saved, dropping the passages of a source the register no longer holds', () => {
		const cited = citePassages(register(), [{ sourceId: 'src-fs-projects', anchor: 'role:admin', words: 'workspace admin', takes: 'Who archives.' }], textOf, newId).draft;
		expect(parseDocumentsDraft(JSON.parse(JSON.stringify(cited)), 'taskora').passages).toEqual(cited.passages);
		const removed = { ...cited, sources: cited.sources.filter((s) => s.id !== 'src-fs-projects') };
		expect(parseDocumentsDraft(JSON.parse(JSON.stringify(removed)), 'taskora').passages).toBeUndefined();
	});

	it('splits the stored text around the passages for the reader that highlights them', () => {
		const at = PAGE.indexOf('workspace admin');
		const parts = markPassages(PAGE, [{ id: 'a', start: at, end: at + 'workspace admin'.length }]);
		expect(parts.map((p) => p.text).join('')).toBe(PAGE);
		expect(parts.filter((p) => p.passageId === 'a').map((p) => p.text)).toEqual(['workspace admin']);
	});
});
