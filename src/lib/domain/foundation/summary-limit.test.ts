import { describe, expect, it } from 'vitest';
import { LIMITS, summaryRefusal } from './validation';

describe('the product summary holds 500 characters at most [criterion:72251131]', () => {
	const words = (n: number) => 'x'.repeat(n);

	it('refuses a summary a save makes longer than 500 characters, naming the limit and the count', () => {
		expect(LIMITS.brief).toBe(500);
		expect(summaryRefusal(words(812), 'Short.')).toBe(
			'The product summary holds 500 characters at most; this one has 812. Shorten it to what the product is, for whom and why.'
		);
	});

	it('takes 500 characters, counted without the spaces around them', () => {
		expect(summaryRefusal(words(500), '')).toBeNull();
		expect(summaryRefusal(`  ${words(500)}\n`, '')).toBeNull();
		expect(summaryRefusal(words(501), '')).not.toBeNull();
	});

	it('lets a summary written longer before stand, as long as the save leaves it as it is', () => {
		expect(summaryRefusal(words(900), words(900))).toBeNull();
		expect(summaryRefusal(words(899), words(900))).not.toBeNull();
	});
});
