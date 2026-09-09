import { describe, expect, it } from 'vitest';
import { replaceOccurrence } from './highlight';

describe('replaceOccurrence', () => {
	it('treats dollar replacement sequences in canonical terms literally', () => {
		expect(replaceOccurrence('Use customer here', 'customer', '$& account')).toBe(
			'Use $& account here'
		);
		expect(replaceOccurrence('Use customer here', 'customer', '$1')).toBe('Use $1 here');
	});
});
