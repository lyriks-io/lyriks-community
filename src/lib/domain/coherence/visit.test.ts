import { describe, expect, it } from 'vitest';
import { visitDelta } from './visit';

describe('since the last visit', () => {
	it('is null on a first visit', () => {
		expect(visitDelta(null, ['a'])).toEqual({ lastSeenAt: null, newIds: [], resolvedCount: 0 });
	});
	it('names what is open now but was not then, and counts what went away', () => {
		expect(visitDelta({ gapIds: ['a', 'b'], at: '2026-09-01T00:00:00Z' }, ['b', 'c'])).toEqual({
			lastSeenAt: '2026-09-01T00:00:00Z',
			newIds: ['c'],
			resolvedCount: 1
		});
	});
});
