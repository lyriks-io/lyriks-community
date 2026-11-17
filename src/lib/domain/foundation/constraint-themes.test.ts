import { describe, expect, it } from 'vitest';
import { BUILT_IN_CONSTRAINT_THEMES, canonicalConstraintTheme, constraintThemeOptions } from './definition';

const row = (theme: string) => ({ id: theme, theme, description: 'x' });

describe('constraintThemeOptions', () => {
	it('always offers the built-in themes, first', () => {
		expect(constraintThemeOptions([])).toEqual([...BUILT_IN_CONSTRAINT_THEMES]);
	});

	it('offers a theme created on the fly after the built-in ones, once', () => {
		expect(constraintThemeOptions([row('Accessibility'), row('accessibility'), row('compliance')])).toEqual([
			...BUILT_IN_CONSTRAINT_THEMES,
			'Accessibility'
		]);
	});
});

describe('canonicalConstraintTheme', () => {
	it('reuses the offered theme a typed one matches, case aside', () => {
		expect(canonicalConstraintTheme(' legal ', [])).toBe('Legal');
		expect(canonicalConstraintTheme('ACCESSIBILITY', [row('Accessibility')])).toBe('Accessibility');
	});

	it('keeps a new theme as typed, trimmed', () => {
		expect(canonicalConstraintTheme('  Sustainability ', [])).toBe('Sustainability');
	});
});
