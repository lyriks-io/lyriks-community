import { describe, expect, it } from 'vitest';
import { brandExportJson, brandExportMarkdown, coerceBrand, defaultBrand } from '$domain/experience';

const typographyOf = (typography: unknown) => coerceBrand({ typography }).typography;

describe('brand typography roles', () => {
	it('reads a draft written before roles existed exactly as before, with no role', () => {
		const typography = typographyOf({
			families: { heading: { stack: '"Inter"', fallback: 'sans-serif' } },
			scale: [{ id: 'sz-1', name: 'base', valuePx: 16, lineHeight: 1.5, usage: 'Body' }]
		});

		expect(typography.families.heading).toEqual({ stack: '"Inter"', fallback: 'sans-serif' });
		expect(typography.scale).toHaveLength(1);
		expect(typography.roles).toEqual([]);
		expect(defaultBrand().typography.roles).toEqual([]);
	});

	it('keeps a named role beside heading, body and mono', () => {
		const typography = typographyOf({
			roles: [
				{
					id: 'fr-display',
					name: '  display ',
					stack: '"Playfair Display", serif',
					fallback: 'Georgia, serif',
					usage: 'Titles only',
					weight: 900
				}
			]
		});

		// The name is trimmed (it becomes a token key), and a field the model does
		// not know is dropped like everywhere else in the brand draft.
		expect(typography.roles).toEqual([
			{
				id: 'fr-display',
				name: 'display',
				stack: '"Playfair Display", serif',
				fallback: 'Georgia, serif',
				usage: 'Titles only'
			}
		]);
	});

	it('gives a row without an id one of its own, and keeps the first of two rows sharing an id', () => {
		const roles = typographyOf({
			roles: [
				{ name: 'wordmark' },
				{ id: 'same', name: 'display' },
				{ id: 'same', name: 'shadowed' },
				'not a row'
			]
		}).roles;

		expect(roles.map((role) => role.name)).toEqual(['wordmark', 'display', '']);
		expect(new Set(roles.map((role) => role.id)).size).toBe(roles.length);
		expect(typographyOf({ roles: 'nonsense' }).roles).toEqual([]);
	});

	it('exports named roles as tokens and in the brandbook, and skips unnamed ones', () => {
		const brand = coerceBrand({
			typography: {
				roles: [
					{ id: 'a', name: 'display', stack: '"Playfair Display"', fallback: 'serif', usage: 'Titles only' },
					{ id: 'b', name: '', stack: '"Nameless"' }
				]
			}
		});

		const tokens = brandExportJson(brand) as { tokens?: { typography?: { roles?: unknown } } };
		const exported = JSON.stringify(tokens);
		expect(exported).toContain('"display":{"stack":"\\"Playfair Display\\"","fallback":"serif","usage":"Titles only"}');
		expect(exported).not.toContain('Nameless');

		const markdown = brandExportMarkdown(brand);
		expect(markdown).toContain('- **display.** "Playfair Display", fallback: serif (Titles only)');
		expect(markdown).not.toContain('Nameless');
	});
});

describe('brand list samples (describe_section)', () => {
	it('survive the brand parser unchanged, so each one shows the shape the draft really holds', async () => {
		const { BRAND_LIST_SAMPLES: samples } = await import('$domain/experience');
		const brand = coerceBrand({
			logo: { variants: [samples['brand.logo.variants']] },
			colors: { tokens: [samples['brand.colors.tokens']] },
			typography: {
				roles: [samples['brand.typography.roles']],
				scale: [samples['brand.typography.scale']],
				weights: [samples['brand.typography.weights']]
			},
			foundation: {
				space: [samples['brand.foundation.space (same item shape for radius and breakpoints)']],
				shadow: [samples['brand.foundation.shadow']]
			},
			components: [samples['brand.components']],
			pages: [samples['brand.pages']],
			examples: [samples['brand.examples']]
		});

		expect(brand.logo.variants).toEqual([samples['brand.logo.variants']]);
		expect(brand.colors.tokens).toEqual([samples['brand.colors.tokens']]);
		expect(brand.typography.roles).toEqual([samples['brand.typography.roles']]);
		expect(brand.typography.scale).toEqual([samples['brand.typography.scale']]);
		expect(brand.typography.weights).toEqual([samples['brand.typography.weights']]);
		expect(brand.foundation.space).toEqual([
			samples['brand.foundation.space (same item shape for radius and breakpoints)']
		]);
		expect(brand.foundation.shadow).toEqual([samples['brand.foundation.shadow']]);
		expect(brand.components).toEqual([samples['brand.components']]);
		expect(brand.pages).toEqual([samples['brand.pages']]);
		expect(brand.examples).toEqual([samples['brand.examples']]);
	});
});
