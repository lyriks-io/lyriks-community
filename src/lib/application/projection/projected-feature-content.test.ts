import { describe, expect, it } from 'vitest';
import { sameProjectedFeature } from './projected-feature-content';

describe('sameProjectedFeature', () => {
	it('ignores only derived top-level bookkeeping and property order', () => {
		expect(sameProjectedFeature(
			{ name: 'Invoice', updatedAt: 'old', elementVersions: { a: 'v1' }, data: { x: 1, y: 2 } },
			{ data: { y: 2, x: 1 }, name: 'Invoice', updatedAt: 'new' }
		)).toBe(true);
	});
	it('keeps nested business timestamps, array order and real content significant', () => {
		expect(sameProjectedFeature({ state: { updatedAt: 'old' } }, { state: { updatedAt: 'new' } })).toBe(false);
		expect(sameProjectedFeature({ steps: ['a', 'b'] }, { steps: ['b', 'a'] })).toBe(false);
		expect(sameProjectedFeature({ guard: false }, { guard: true })).toBe(false);
		expect(sameProjectedFeature({ value: null }, {})).toBe(false);
	});
});
