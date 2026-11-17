import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { TRACED_BY_ANALYSIS, analysisSpansAsPassages, storedTextOf } from './source-passages.server';
import type { AppServices } from '$composition/container.server';

const services = (spans: unknown[], pages: string[] = []) =>
	({
		loadFeaturesDraft: { execute: async () => ({ features: [{ id: 'feat-tkr-workflow', unspaghettitFeatureId: '' }] }) },
		codeAdoption: {
			getProvenance: async () => ({ ok: true, value: { spans } }),
			getSource: async (_id: string, opts: { offset?: number }) => {
				const all = pages.join('');
				const at = opts.offset ?? 0;
				const page = pages.find((_, i) => pages.slice(0, i).join('').length === at) ?? '';
				return { ok: true, value: { content: page, totalChars: all.length } };
			}
		}
	}) as unknown as AppServices;

describe('the reader shows the analysis spans of a behaviour element beside its passages [criterion:f09da92d]', () => {
	it('reads the spans of the element in the same stored text as passages traced by the analysis', async () => {
		const spans = [
			{ id: 's1', elementId: 'act1', sourceId: 'st-1', startOffset: 10, endOffset: 30, snippet: 'between 2 and 12 st' },
			{ id: 's2', elementId: 'act2', sourceId: 'st-1', startOffset: 40, endOffset: 50, snippet: 'x' },
			{ id: 's3', elementId: 'act1', sourceId: 'st-other', startOffset: 0, endOffset: 5, snippet: 'y' }
		];
		const got = await analysisSpansAsPassages(services(spans), 'taskora', 'action:feat-tkr-workflow:act1', 'src-fs', 'st-1');
		expect(got).toEqual([{ id: 'span-s1', sourceId: 'src-fs', anchor: 'action:feat-tkr-workflow:act1', start: 10, end: 30, words: 'between 2 and 12 st', takes: TRACED_BY_ANALYSIS }]);
		// Elements that the analysis does not trace (a role, a term) read their cited passages alone.
		expect(await analysisSpansAsPassages(services(spans), 'taskora', 'role:admin', 'src-fs', 'st-1')).toEqual([]);
	});

	it('reads a stored text whole, page after page', async () => {
		expect(await storedTextOf(services([], ['abc', 'def']), 'st-1')).toBe('abcdef');
	});
});
