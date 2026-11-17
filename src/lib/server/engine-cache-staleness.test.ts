import { describe, expect, it } from 'vitest';
import { MAX_AGE_MS, UNSIGNED_TTL_MS, needsRefresh, readSignature } from './engine-cache-staleness';

describe('engine cache staleness', () => {
	const now = 10_000_000;
	it('computes a reading never computed', () => {
		expect(needsRefresh({ at: 0 }, 'sig', now)).toBe(true);
	});
	it('keeps a reading while the model is the same, however often it is read', () => {
		expect(needsRefresh({ at: now - 5 * 60_000, signature: 'sig' }, 'sig', now)).toBe(false);
	});
	it('recomputes once the model changed', () => {
		expect(needsRefresh({ at: now - 1000, signature: 'old' }, 'new', now)).toBe(true);
	});
	it('recomputes past the safety age even on the same model', () => {
		expect(needsRefresh({ at: now - MAX_AGE_MS - 1, signature: 'sig' }, 'sig', now)).toBe(true);
	});
	it('falls back to the short timer when no signature can be read', () => {
		expect(needsRefresh({ at: now - UNSIGNED_TTL_MS + 1 }, null, now)).toBe(false);
		expect(needsRefresh({ at: now - UNSIGNED_TTL_MS - 1 }, null, now)).toBe(true);
	});
	it('reads no signature when the reader throws', () => {
		expect(readSignature(() => { throw new Error('gone'); }, 'p')).toBeNull();
		expect(readSignature(undefined, 'p')).toBeNull();
	});
});
