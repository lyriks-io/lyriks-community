import { describe, expect, it } from 'vitest';
import { toastHeadline } from './toast-headline';

describe('toastHeadline', () => {
	it('keeps a short message whole', () => {
		expect(toastHeadline('Saved.')).toBe('Saved.');
	});

	it('keeps only the kind of error of a long issue list, with its count', () => {
		const detail = Array.from({ length: 52 }, (_, i) => `scenarios[${i}].relatedFeatureId is not a supported field`).join('; ');
		expect(toastHeadline(`invalid_section_shape [rules]: ${detail}`)).toBe('invalid_section_shape [rules], 52 issues');
	});

	it('cuts a long message with no kind at a fixed length', () => {
		const out = toastHeadline('x'.repeat(400));
		expect(out.length).toBe(161);
		expect(out.endsWith('…')).toBe(true);
	});
});
