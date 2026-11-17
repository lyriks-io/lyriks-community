import { describe, expect, it } from 'vitest';
import { defaultBrand } from '$domain/experience';
import { colorToHex, checkDesign } from '$domain/experience';
import { designSystemOf, paletteRows, surfaceSwatches, typeSpecimen, type TypeSize } from './experience';
import { designSystemReading } from '../specification/design-system-reading';

/** The design system read in plain words on the Experience page [criterion:ac-leaf-ac-brand-design-system-read]. */

const kutt = () => {
	const brand = defaultBrand();
	brand.typography.families.body = { stack: "'Nunito'", fallback: 'sans-serif' };
	brand.typography.scale = [
		{ id: 'sz-body', name: 'body', valuePx: 16, lineHeight: 1.45, usage: 'Body copy' },
		{ id: 'sz-button', name: 'button', valuePx: 13, lineHeight: 1, usage: 'Button labels' }
	] as typeof brand.typography.scale;
	brand.foundation.radius = [
		{ id: 'rd-pill', name: 'pill', valuePx: 100, usage: 'Buttons and text fields' },
		{ id: 'rd-card', name: 'card', valuePx: 12, usage: 'Dialogs and panels' }
	];
	brand.foundation.shadow = [{ id: 'sh', name: 'button', value: '0 5px 6px rgba(0,0,0,.1)', usage: 'Resting button' }];
	brand.foundation.breakpoints = [{ id: 'bp', name: 'mobile', valuePx: 640, usage: 'phone layout' }];
	brand.markers = { ...brand.markers, cornerStyle: 'rounded', density: 'comfortable', shadowStyle: 'subtle', borderStyle: 'soft', motion: 'smooth', iconStyle: 'outline' };
	return brand;
};

describe('the design system on the Experience page [criterion:ac-leaf-ac-brand-design-system-read]', () => {
	it('reads the type, each size with what it is for, the corners, the shadows and the breakpoints', () => {
		const ds = designSystemOf(kutt());
		expect(ds.family).toBe('Nunito');
		expect(ds.sizes).toEqual([
			{ name: 'body', value: '16px · 1.45', px: 16, lineHeight: 1.45, usage: 'Body copy' },
			{ name: 'button', value: '13px · 1', px: 13, lineHeight: 1, usage: 'Button labels' }
		]);
		expect(ds.corners.map((c) => `${c.name} ${c.value}`)).toEqual(['pill 100px', 'card 12px']);
		expect(ds.shadows).toEqual([{ name: 'button', value: '0 5px 6px rgba(0,0,0,.1)', px: null, usage: 'Resting button' }]);
		expect(ds.breakpoints[0]).toMatchObject({ name: 'mobile', value: '640px', usage: 'phone layout' });
		expect(ds.spacing).toEqual([]);
	});

	it('reads the type scale as a specimen, from the largest size down, sizes of one value in the order the brand gives them', () => {
		const size = (name: string, px: number): TypeSize => ({ name, px, lineHeight: 1.5, value: `${px}px`, usage: '' });
		const scale = [size('body', 17), size('largeTitle', 34), size('callout', 16), size('headline', 17), size('title1', 28)];
		expect(typeSpecimen(scale).map((t) => t.name)).toEqual(['largeTitle', 'title1', 'body', 'headline', 'callout']);
		expect(scale[0].name).toBe('body');
	});

	it('says the style in a few words, never the names of the markers', () => {
		expect(designSystemOf(kutt()).style).toEqual(['Rounded corners', 'Comfortable density', 'Subtle shadows', 'Soft borders', 'Smooth motion', 'Outline icons']);
	});

	it('shows no style for a brand nobody described: the defaults are not the specification', () => {
		const ds = designSystemOf(defaultBrand());
		expect(ds).toMatchObject({ family: '', sizes: [], corners: [], style: [] });
	});

	it('draws the samples with the brand\'s fallback, as the product falls back', () => {
		expect(designSystemOf(kutt()).familyCss).toBe("'Nunito', sans-serif");
	});
});

/** The palette, the strict minimum a design manages [criterion:ac-leaf-ac-brand-palette-roles]. */
describe('the palette of the brand [criterion:ac-leaf-ac-brand-palette-roles]', () => {
	const withPalette = () => {
		const brand = kutt();
		brand.colors.palette.primary.base = 'hsl(207, 90%, 54%)';
		brand.colors.palette.secondary = { base: 'hsl(262, 47%, 55%)', hover: 'hsl(262, 52%, 47%)', active: '' };
		brand.colors.semantic = { ...brand.colors.semantic, background: 'hsl(206, 12%, 95%)', text: 'hsl(200, 35%, 25%)', border: 'hsl(200, 14%, 90%)', error: 'hsl(0, 86%, 63%)' };
		return brand;
	};

	it('reads one row per role, its three shades side by side, a shade not given reading not set', () => {
		const rows = paletteRows(withPalette());
		expect(rows.map((r) => r.role)).toEqual(['Primary', 'Secondary', 'Tertiary']);
		expect(rows[0].shades).toEqual([
			{ state: 'Base', color: 'hsl(207, 90%, 54%)', hex: '#2094f3' },
			{ state: 'Hover', color: '', hex: null },
			{ state: 'Active', color: '', hex: null }
		]);
		expect(rows[1].shades.map((s) => s.color)).toEqual(['hsl(262, 47%, 55%)', 'hsl(262, 52%, 47%)', '']);
		expect(rows[2].shades.every((s) => s.color === '')).toBe(true);
	});

	it('then the colours of text and surfaces only, never the status colours', () => {
		expect(surfaceSwatches(withPalette()).map((s) => s.name)).toEqual(['Background', 'Text', 'Border']);
	});

	it('reads the primary of a brand described before the palette from the colour that says it is primary, never a gradient', () => {
		const brand = defaultBrand();
		brand.colors.tokens = [
			{ id: 'b', name: '--button-bg-primary', value: 'linear-gradient(to right, red, blue)', usage: '' },
			{ id: 'p', name: '--color-primary', value: 'hsl(207, 90%, 54%)', usage: '' }
		] as typeof brand.colors.tokens;
		expect(paletteRows(brand)[0].shades[0].color).toBe('hsl(207, 90%, 54%)');
		expect(paletteRows(defaultBrand())).toEqual([]);
	});
});

/** The design system an AI reads and holds a design against [criterion:ac-leaf-ac-brand-design-mcp]. */
describe('the design system for an AI [criterion:ac-leaf-ac-brand-design-mcp]', () => {
	it('turns every plain colour into hex, and none of a gradient or a variable', () => {
		expect(colorToHex('hsl(207, 90%, 54%)')).toBe('#2094f3');
		expect(colorToHex('#FFF')).toBe('#ffffff');
		expect(colorToHex('rgb(33, 150, 243)')).toBe('#2196f3');
		expect(colorToHex('linear-gradient(to right, red, blue)')).toBeNull();
		expect(colorToHex('var(--x)')).toBeNull();
	});

	it('reads the palette, the surfaces and the sizes in one answer, each colour with its hex', () => {
		const reading = designSystemReading(kutt());
		expect(reading.type.family).toBe('Nunito');
		expect(reading.corners.map((c) => c.name)).toEqual(['pill', 'card']);
		expect(reading.sourceIds).toEqual([]);
	});

	it('says of each value of a design whether it matches, is close or is outside the design system', () => {
		const brand = kutt();
		brand.colors.palette.primary.base = 'hsl(207, 90%, 54%)';
		const system = designSystemReading(brand).system;
		const check = checkDesign(system, {
			colors: [
				{ name: 'Button', value: '#2094F3' },
				{ name: 'Link', value: '#2A93EE' },
				{ name: 'Banner', value: '#FF00AA' }
			],
			sizes: [
				{ kind: 'font', name: 'Body', px: 16 },
				{ kind: 'radius', name: 'Card', px: 13 },
				{ kind: 'radius', name: 'Chip', px: 30 }
			]
		});
		expect(check.findings.map((f) => `${f.name} ${f.fit} ${f.nearest}`)).toEqual([
			'Button matches Primary · base',
			'Link close Primary · base',
			'Banner outside Primary · base',
			'Body matches body',
			'Card close card',
			'Chip outside card'
		]);
		expect(check).toMatchObject({ matches: 2, close: 2, outside: 2 });
	});
});
