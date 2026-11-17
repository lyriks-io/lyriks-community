import { describe, expect, it } from 'vitest';
import { detectedText, namedIn, newlyNamed, type NamedParts } from './detected';

const parts: NamedParts = {
	features: { features: [{ id: 'f1', name: 'Send a message' }, { id: 'f2', name: '  ' }] as never },
	behavior: { actionsByFeature: { f1: [{ id: 'a1', name: 'Send', intent: '' }], f3: [{ id: 'a1', name: 'Archive', intent: '' }] } },
	glossary: { terms: [{ id: 't1', term: 'Group' }] as never },
	documents: { sources: [{ id: 's1', title: 'README.md' }] as never }
};

describe('the elements a section names', () => {
	it('reads each section by its own name field, an unnamed one left for later', () => {
		expect(namedIn('features', parts)).toEqual([{ key: 'f1', name: 'Send a message' }]);
		expect(namedIn('glossary', parts)).toEqual([{ key: 't1', name: 'Group' }]);
		expect(namedIn('documents', parts)).toEqual([{ key: 's1', name: 'README.md' }]);
		expect(namedIn('data', parts)).toEqual([]);
	});

	it('keys an action by its feature, so two features holding the same action id stay apart', () => {
		expect(namedIn('behavior', parts).map((e) => e.key)).toEqual(['f1:a1', 'f3:a1']);
	});

	it('keeps only what was not known, by id, so a rename is never news', () => {
		const known = new Set(['f1']);
		expect(newlyNamed(known, [{ key: 'f1', name: 'Send a message, renamed' }, { key: 'f4', name: 'Pin a chat' }])).toEqual([{ key: 'f4', name: 'Pin a chat' }]);
	});
});

describe('how a detection reads in the log', () => {
	const at = '2026-10-29T10:00:00.000Z';
	it('names a single element', () => {
		expect(detectedText({ at, kind: 'feature', names: ['Send a message'] })).toBe('Lyriks detected the feature “Send a message”');
	});

	it('spells out a few and counts the rest', () => {
		expect(detectedText({ at, kind: 'table', names: ['User', 'Group'] })).toBe('Lyriks detected 2 tables: “User” and “Group”');
		expect(detectedText({ at, kind: 'technology', names: ['Swift', 'GRDB', 'SQLCipher', 'WebRTC', 'Signal Protocol'] })).toBe(
			'Lyriks detected 5 technologies: “Swift”, “GRDB”, “SQLCipher” and 2 more'
		);
	});
});
