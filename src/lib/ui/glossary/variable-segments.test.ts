import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { GlossaryTerm } from '$domain/glossary';
import EarsText from './EarsText.svelte';
import { glossaryContextOf } from './glossary-context';
import { variableSegments } from './variable-segments';

const text = 'When the file key is set, the system shall allow it.';
const start = text.indexOf('file key');
const variables = [{ start, end: start + 'file key'.length, identifiers: ['file.key', 'fileKey'] }];
const terms = [{ id: 'key', term: 'file key', definition: 'A key stored in an archive.', synonymsAllowed: [], synonymsAvoid: [] }] as unknown as GlossaryTerm[];

describe('accessible EARS variable hints [criterion:7dc9e813]', () => {
	it('preserves every character and combines overlapping glossary definitions in one span', () => {
		const segments = variableSegments(text, terms, variables);
		expect(segments.map((part) => part.text).join('')).toBe(text);
		const hints = segments.filter((part) => part.identifiers);
		expect(hints).toHaveLength(1);
		expect(hints[0].definitions?.[0].definition).toBe('A key stored in an archive.');
		expect(hints[0].mark).toBeUndefined();
	});

	it('renders one keyboard target per variable with exact candidate names and keeps EARS emphasis', () => {
		const { body } = render(EarsText, { props: { text, variables }, context: glossaryContextOf(terms) });
		expect(body).toContain('aria-label="Variable identifiers: file.key, fileKey"');
		expect(body).toContain('tabindex="0"');
		expect(body).toContain('variable-mark');
		expect(body).not.toContain('gloss-mark');
		expect(body).toMatch(/<strong[^>]*>When<\/strong>/);
		expect(body).toMatch(/<strong[^>]*>shall<\/strong>/);
	});

	it('leaves invalid ranges and absent metadata harmless while retaining the glossary', () => {
		const invalid = [{ start: -1, end: 3, identifiers: ['wrong'] }, { start: 2, end: 999, identifiers: ['wrong'] }];
		expect(variableSegments(text, terms, invalid).map((part) => part.text).join('')).toBe(text);
		expect(render(EarsText, { props: { text }, context: glossaryContextOf(terms) }).body).toContain('gloss-mark');
	});
});
