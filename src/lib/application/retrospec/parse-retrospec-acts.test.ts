import { describe, expect, it } from 'vitest';
import { parseRetrospecActs } from './parse-retrospec-acts';

describe('Validate all names every open change in one act [criterion:42311513]', () => {
	it('takes a report of hundreds of changes in one act, each id once', () => {
		const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
		expect(parseRetrospecActs({ acts: [{ op: 'validate_changes', ids: [...ids, ' c0 '] }] })).toEqual({ ok: true, acts: [{ op: 'validate_changes', ids }] });
	});

	it('refuses an act that names no change, or names one with no id', () => {
		expect(parseRetrospecActs({ acts: [{ op: 'validate_changes', ids: [] }] })).toMatchObject({ ok: false });
		expect(parseRetrospecActs({ acts: [{ op: 'validate_changes' }] })).toMatchObject({ ok: false });
		expect(parseRetrospecActs({ acts: [{ op: 'validate_changes', ids: ['c1', ' '] }] })).toEqual({ ok: false, reason: 'Each id names a change of the report.' });
		expect(parseRetrospecActs({ acts: [{ op: 'validate_changes', ids: ['c1', 7] }] })).toEqual({ ok: false, reason: 'Each id names a change of the report.' });
	});
});
