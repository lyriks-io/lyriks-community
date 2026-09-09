import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { expectedRevision, REVISION_HEADER } from './draft-lock.server';

const request = (value?: string) =>
	new Request('http://localhost/api/draft/test', {
		headers: value === undefined ? {} : { [REVISION_HEADER]: value }
	});

describe('expectedRevision', () => {
	it('accepts an absent header and non-negative integers', () => {
		expect(expectedRevision(request())).toBeNull();
		expect(expectedRevision(request('0'))).toBe(0);
		expect(expectedRevision(request('12'))).toBe(12);
	});

	it.each(['NaN', 'undefined', '-1', '1.5'])('rejects malformed revision %s', (value) => {
		let thrown: unknown;
		try {
			expectedRevision(request(value));
		} catch (error) {
			thrown = error;
		}
		expect(isHttpError(thrown) && thrown.status === 400).toBe(true);
	});
});
