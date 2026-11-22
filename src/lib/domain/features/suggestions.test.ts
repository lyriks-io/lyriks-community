import { describe, expect, it } from 'vitest';
import { createCore, createEmptyFeaturesDraft } from './draft';
import { matchCore, parseFeatureSuggestions } from './suggestions';

describe('the feature suggestions an AI client pushes', () => {
	it('keeps each well-formed suggestion, trimmed, with lower-case keywords', () => {
		expect(
			parseFeatureSuggestions([{ id: ' s1 ', title: '  Refund an order ', rationale: 'Asked twice', coreKeywords: ['Pay', 3, 'BILLING'], preferredCore: 'Payments' }])
		).toEqual([{ id: 's1', title: 'Refund an order', rationale: 'Asked twice', coreKeywords: ['pay', 'billing'], preferredCore: 'Payments' }]);
	});

	it('drops what has no title or repeats one in any case, keeping the first, and numbers an id-less one by its place', () => {
		const parsed = parseFeatureSuggestions([null, 'Refund', { title: '   ' }, { title: 'Export' }, { id: 'x', title: 'EXPORT' }]);
		expect(parsed.map((s) => [s.id, s.title])).toEqual([['mcp-3', 'Export']]);
	});

	it('reads missing or malformed fields as empty, and a blank preferred core as none', () => {
		const [s] = parseFeatureSuggestions([{ title: 'Export', rationale: 4, coreKeywords: 'pay', preferredCore: '  ' }]);
		expect(s).toEqual({ id: 'mcp-0', title: 'Export', rationale: '', coreKeywords: [], preferredCore: undefined });
		expect(parseFeatureSuggestions({ title: 'Export' })).toEqual([]);
	});

	it('routes a suggestion to the first core whose name holds one of its keywords, whatever the case', () => {
		const draft = { ...createEmptyFeaturesDraft('p'), cores: [createCore({ id: 'c-ship', name: 'Shipping' }), createCore({ id: 'c-pay', name: 'Online Payments' })] };
		const suggestion = (coreKeywords: string[]) => ({ id: 's', title: 't', rationale: '', coreKeywords });
		expect(matchCore(draft, suggestion(['PAYMENT']))?.id).toBe('c-pay');
		expect(matchCore(draft, suggestion(['tax', 'ship']))?.id).toBe('c-ship');
		expect(matchCore(draft, suggestion(['tax']))).toBeNull();
	});
});
