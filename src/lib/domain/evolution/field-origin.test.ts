import { describe, expect, it } from 'vitest';
import { fieldOrigin } from './field-origin';

/**
 * Whose each part of an answer is. What this test pins is ac-evo-mat-split-bar:
 * the request's lines and the feature's, both in full, never a count.
 */
describe('an answer says what the request brings and what the feature already held', () => {
	it('splits a list line by line, the draft and the signed value counted as the request, the feature in grey without repeats', () => {
		const origin = fieldOrigin({
			kind: 'list',
			requestValues: ['A text when the order is ready.\nNo number, no text.', 'At most one text per order.'],
			featureValue: 'An order is handed over only once ready.\nno number, no text'
		});
		expect(origin).toEqual({
			request: ['A text when the order is ready.', 'No number, no text.', 'At most one text per order.'],
			feature: ['An order is handed over only once ready.']
		});
	});

	it('reads a text answer as the request own, with the feature earlier text beside it only when it differs', () => {
		expect(fieldOrigin({ kind: 'text', requestValues: ['', 'Tell the customer.'], featureValue: 'Hand orders over.' })).toEqual({
			request: ['Tell the customer.'],
			feature: ['Hand orders over.']
		});
		expect(fieldOrigin({ kind: 'text', requestValues: [''], featureValue: 'Hand orders over.' })).toEqual({ request: [], feature: ['Hand orders over.'] });
		expect(fieldOrigin({ kind: 'text', requestValues: ['Hand orders over'], featureValue: 'Hand orders over.' })).toEqual({ request: ['Hand orders over'], feature: [] });
	});
});
