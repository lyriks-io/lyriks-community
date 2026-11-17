import { describe, expect, it } from 'vitest';
import { leavesOutsideBaseline } from './report-derivation';

const version = (n: number, bases: (string | null)[]) => ({
	version: n,
	at: '2026-11-16T00:00:00Z',
	by: 'a@b.c',
	snapshot: { subjects: bases.map((baseLeafId, i) => ({ id: `draft:${n}-${i}`, kind: 'amend', baseLeafId })) }
});

describe('the features a report reads as inherited (ac-evo-impl-baseline)', () => {
	it('takes every touched feature before the first freeze, drafts aside', () => {
		expect(leavesOutsideBaseline({ leafIds: ['f1', 'draft:x', 'f2'], frozenVersions: [] } as never)).toEqual(['f1', 'f2']);
	});

	it('takes only the feature a rebrief added, once the covered features are recorded', () => {
		const request = { leafIds: ['f1', 'f2', 'f3'], baselineKeys: ['action:a'], baselineLeafIds: ['f1', 'f2'], frozenVersions: [] };
		expect(leavesOutsideBaseline(request as never)).toEqual(['f3']);
	});

	it('reads the first frozen version of a request baselined before the covered features were recorded', () => {
		const request = { leafIds: ['f1', 'f2', 'f97'], baselineKeys: ['action:a'], frozenVersions: [version(2, ['f1', 'f2', 'f97']), version(1, ['f1', 'f2'])] };
		expect(leavesOutsideBaseline(request as never)).toEqual(['f97']);
	});
});
