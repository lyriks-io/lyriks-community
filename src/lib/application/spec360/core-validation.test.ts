import { describe, expect, it } from 'vitest';
import { coreValidation } from './core-validation';

const elements = [
	'product',
	'core:c1',
	'core:c2',
	'feature:f1',
	'action:f1:a1',
	'rule:f1:r1',
	'rule:f1:r2',
	'flow:f1',
	'feature:f2',
	'feature:f3',
	'action:f3:a9',
	'term:t1'
];

describe('a whole core feature validated at once', () => {
	it('covers the core feature and every element of its features, in the spec order', () => {
		expect(coreValidation(elements, 'c1', ['f1', 'f2'])).toEqual({
			anchors: ['core:c1', 'feature:f1', 'action:f1:a1', 'rule:f1:r1', 'rule:f1:r2', 'flow:f1', 'feature:f2']
		});
	});

	it('holds only the core feature while it has no feature yet, and nothing it does not count', () => {
		expect(coreValidation(elements, 'c2', [])).toEqual({ anchors: ['core:c2'] });
		expect(coreValidation(elements, 'c9', [])).toEqual({ anchors: [] });
	});
});
