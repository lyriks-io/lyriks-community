import { describe, expect, it } from 'vitest';
import { languageOwnName } from './language-name';

describe('a language by its own name', () => {
	it('reads the language of a locale tag in that language', () => {
		expect(languageOwnName('en')).toBe('English');
		expect(languageOwnName('fr-FR')).toBe('Français');
		expect(languageOwnName('de_DE')).toBe('Deutsch');
	});

	it('keeps a tag no language answers to', () => {
		expect(languageOwnName('zz-ZZ')).toBe('zz-ZZ');
		expect(languageOwnName('  ')).toBe('');
	});
});
