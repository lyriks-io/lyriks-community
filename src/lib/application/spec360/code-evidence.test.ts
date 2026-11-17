import { describe, expect, it } from 'vitest';
import { EXCERPT_MAX_LINES, codeEvidence, numberedExcerpt, spanForPlace } from './code-evidence';

const sources = [
	{ id: 's1', name: 'server/handlers/links.handler.js', projectId: 'p' },
	{ id: 's2', name: 'server/utils/utils.js', projectId: 'p' }
];
const spans = [
	{ elementId: 'surface-1', sourceId: 's1', startLine: 1, endLine: 300 },
	{ elementId: 'act-shorten', sourceId: 's1', startLine: 99, endLine: 161 },
	{ elementId: 'rule-x', sourceId: 's1', startLine: 120, endLine: 124 },
	{ elementId: 'act-shorten', sourceId: 's2', startLine: 5, endLine: 9 }
];
const content = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n');

describe('a card never shows an older excerpt as the proof of a place [criterion:496d102c]', () => {
	const place = { file: 'server/handlers/links.handler.js', line: 120 };

	it('keeps the span while it still holds the line the index recorded, past the excerpt included', () => {
		expect(codeEvidence({ place, span: spans[2], content, indexLine: '  line 123 ' })).toMatchObject({ kind: 'span', from: 120, to: 124 });
		expect(codeEvidence({ place, span: spans[1], content, indexLine: 'line 160' })).toMatchObject({ kind: 'span', from: 99, leftOut: 49 });
	});

	it('shows the line the index recorded once the span no longer holds it', () => {
		expect(codeEvidence({ place, span: spans[2], content, indexLine: 'recordVisit(req, link);' })).toEqual({ kind: 'index_line', file: place.file, lines: [{ n: 120, text: 'recordVisit(req, link);' }] });
	});

	it('keeps the span when the index recorded no line to compare it with', () => {
		expect(codeEvidence({ place, span: spans[2], content, indexLine: '' })).toMatchObject({ kind: 'span', from: 120 });
	});
});

describe('a place in the code opens the lines that prove it [criterion:ac-leaf-ac-src-code-place]', () => {
	it("finds the element's own span in that file first", () => {
		expect(spanForPlace(spans, sources, { elementId: 'act-shorten', file: 'server/handlers/links.handler.js', line: 99 })).toEqual(spans[1]);
		expect(spanForPlace(spans, sources, { elementId: 'act-shorten', file: './server/utils/utils.js', line: null })).toEqual(spans[3]);
	});

	it('without the element, takes the narrowest span of that file that holds the line', () => {
		expect(spanForPlace(spans, sources, { file: 'server/handlers/links.handler.js', line: 121 })?.elementId).toBe('rule-x');
		expect(spanForPlace(spans, sources, { file: 'server/other.js', line: 121 })).toBeNull();
	});

	it('numbers the lines and says how many it leaves out', () => {
		const { lines, leftOut } = numberedExcerpt(content, 99, 161);
		expect(lines).toHaveLength(EXCERPT_MAX_LINES);
		expect(lines[0]).toEqual({ n: 99, text: 'line 99' });
		expect(leftOut).toBe(161 - 99 + 1 - EXCERPT_MAX_LINES);
		expect(numberedExcerpt(content, 120, 124)).toEqual({ lines: [120, 121, 122, 123, 124].map((n) => ({ n, text: `line ${n}` })), leftOut: 0 });
	});

	it('shows the span, else the line the index recorded, else says nothing is held', () => {
		const place = { elementId: 'rule-x', file: 'server/handlers/links.handler.js', line: 120 };
		expect(codeEvidence({ place, span: spans[2], content })).toMatchObject({ kind: 'span', from: 120, to: 124, leftOut: 0 });
		expect(codeEvidence({ place, span: null, content: null, indexLine: '  if (!link) throw new CustomError("Link was not found.");' })).toEqual({
			kind: 'index_line',
			file: place.file,
			lines: [{ n: 120, text: 'if (!link) throw new CustomError("Link was not found.");' }]
		});
		expect(codeEvidence({ place, span: null, content: null, indexLine: '' })).toEqual({ kind: 'none', file: place.file });
		expect(codeEvidence({ place, span: spans[2], content: null, indexLine: null }).kind).toBe('none');
	});
});
