import { describe, expect, it } from 'vitest';
import { isMarked } from './selection';

// ac-evo-func-uml-text: the drawing marks every element a problem sits on.
describe('isMarked', () => {
	const marks = [
		{ kind: 'transition', object: 'Commande', index: 2 },
		{ kind: 'step', useCase: 'Bake', index: 0 }
	];

	it('marks an element a problem sits on, whatever the case of its names', () => {
		expect(isMarked(marks, { kind: 'transition', object: 'commande', index: 2 })).toBe(true);
		expect(isMarked(marks, { kind: 'step', useCase: 'Bake', index: 0 })).toBe(true);
	});

	it('leaves every other element unmarked', () => {
		expect(isMarked(marks, { kind: 'transition', object: 'Commande', index: 0 })).toBe(false);
		expect(isMarked(marks, { kind: 'use_case', name: 'Bake' })).toBe(false);
		expect(isMarked([], { kind: 'step', useCase: 'Bake', index: 0 })).toBe(false);
	});
});
