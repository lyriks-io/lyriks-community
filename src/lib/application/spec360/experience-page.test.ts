import { describe, expect, it } from 'vitest';
import { colorSlots, colorsIntro, drawableShadow, shadowSamples, styleSentence, swatchInk, typeIntro, type DesignToken, type PaletteRow, type TypeSize } from './experience';

const row = (role: string, base: string, hover = '', active = ''): PaletteRow => ({
	role,
	shades: [
		{ state: 'Base', color: base, hex: base || null },
		{ state: 'Hover', color: hover, hex: hover || null },
		{ state: 'Active', color: active, hex: active || null }
	]
});

/** The Colors section of the Experience page [criterion:ac-leaf-ac-brand-palette-roles]. */
describe('the color slots of the Experience page [criterion:ac-leaf-ac-brand-palette-roles]', () => {
	const palette = [row('Primary', '#2094f3'), row('Secondary', '#7e56c2', '#673ab6'), row('Tertiary', '')];
	const surfaces = [
		{ name: 'Background', color: '#f0f2f4' },
		{ name: 'Text', color: '#294452', usage: 'Body text' },
		{ name: 'Border', color: '#e1e5e8' }
	];

	it('draws every slot, the three roles then text and surfaces, a slot the brand does not give reading not set', () => {
		const slots = colorSlots(palette, surfaces);
		expect(slots.map((s) => `${s.name}:${s.color || 'not set'}`)).toEqual([
			'Primary:#2094f3',
			'Secondary:#7e56c2',
			'Tertiary:not set',
			'Background:#f0f2f4',
			'Surface:not set',
			'Text:#294452',
			'Border:#e1e5e8'
		]);
		expect(slots[5]).toMatchObject({ hex: '#294452', usage: 'Body text' });
	});

	it('keeps under a role only the hover and active shades the brand gives', () => {
		const [primary, secondary] = colorSlots(palette, surfaces);
		expect(primary.shades).toEqual([]);
		expect(secondary.shades).toEqual([{ state: 'Hover', color: '#673ab6', hex: '#673ab6' }]);
	});

	it('says which slots are set and which are not, never more', () => {
		expect(colorsIntro(colorSlots(palette, surfaces))).toBe(
			'Set: primary, secondary (with its hover shade), background, text and border. Not set yet: tertiary and surface.'
		);
	});

	it('reads a role given only by its hover shade as that shade only', () => {
		const slots = colorSlots([row('Primary', '', '#111111')], []);
		expect(colorsIntro(slots)).toBe('Set: primary (hover shade only). Not set yet: secondary, tertiary, background, surface, text and border.');
	});

	it('says when every slot is set, and draws nothing for a brand that names no color', () => {
		const all = colorSlots(
			[row('Primary', '#1', '#2', '#3'), row('Secondary', '#4'), row('Tertiary', '#5')],
			['Background', 'Surface', 'Text', 'Border'].map((name) => ({ name, color: '#fff' }))
		);
		expect(colorsIntro(all)).toBe('Every color slot is set: primary (with its hover and active shades), secondary, tertiary, background, surface, text and border.');
		expect(colorSlots([], [])).toEqual([]);
		expect(colorsIntro([])).toBe('No color is set yet.');
	});
});

/** The design system read in plain words [criterion:ac-leaf-ac-brand-design-system-read]. */
describe('the lead and the type of the Experience page [criterion:ac-leaf-ac-brand-design-system-read]', () => {
	it('says the style as one sentence, a marker set to none reading "no"', () => {
		expect(styleSentence(['Rounded corners', 'Comfortable density', 'Outline icons'])).toBe('Rounded corners, comfortable density and outline icons.');
		expect(styleSentence(['None shadows', 'Soft borders'])).toBe('No shadows and soft borders.');
		expect(styleSentence([])).toBe('');
	});

	const size = (name: string, px: number, lineHeight: number | null): TypeSize => ({ name, px, lineHeight, value: `${px}px`, usage: '' });

	it('names the family, a line height every size shares, and how the sizes are drawn', () => {
		expect(typeIntro({ family: 'Nunito', sizes: [size('body', 16, 1.45), size('button', 13, 1)] })).toBe('Nunito. 2 sizes from the largest, each drawn to scale.');
		expect(typeIntro({ family: 'Inter', sizes: [size('body', 16, 1.5), size('title', 28, 1.5)] })).toBe('Inter, line height 1.5. 2 sizes from the largest, each drawn to scale.');
		expect(typeIntro({ family: '', sizes: [size('body', 16, null)] })).toBe('One size, drawn to scale.');
		expect(typeIntro({ family: 'Inter', sizes: [] })).toBe('Inter.');
	});
});

describe('the value written on a swatch [criterion:ac-leaf-ac-brand-palette-roles]', () => {
	it('reads in white on a dark colour and in ink on a light one', () => {
		expect(swatchInk('#787880')).toBe('white');
		expect(swatchInk('#5b2fd6')).toBe('white');
		expect(swatchInk('#f0f2f4')).toBe('ink');
		expect(swatchInk('#2094f3')).toBe('ink');
		expect(swatchInk(null)).toBe('ink');
	});
});

describe('a shadow drawn on the page [criterion:ac-leaf-ac-brand-design-system-read]', () => {
	it('draws a colour named by a stylesheet variable in neutral grey, or in its own fallback', () => {
		expect(drawableShadow('0 5px 6px var(--button-bg-box-shadow-color)')).toBe('0 5px 6px rgb(21 23 28 / 0.22)');
		expect(drawableShadow('0 1px 2px var(--shadow, rgba(0, 0, 0, 0.2))')).toBe('0 1px 2px rgba(0, 0, 0, 0.2)');
		expect(drawableShadow('0 1px 2px rgba(0,0,0,.05)')).toBe('0 1px 2px rgba(0,0,0,.05)');
	});

	const token = (name: string, value: string, usage = ''): DesignToken => ({ name, value, px: null, usage });
	// Kutt: two button shadows tinted by a variable of its stylesheet, and a card shadow.
	const kutt = [
		token('button', '0 5px 6px var(--button-bg-box-shadow-color)', "Resting button, tinted with the button's own colour"),
		token('button hover', '0 6px 15px var(--button-bg-box-shadow-color)', 'Hovered or focused button'),
		token('card', '0 1px 2px rgb(16 16 26 / 0.04)')
	];
	const palette = [row('Primary', '#2196f3', '#1976d2'), row('Secondary', ''), row('Tertiary', '')];

	it('draws a button shadow under a button in the primary colour, tinted with it, and its hover shadow in the hover shade', () => {
		const [rest, hover, card] = shadowSamples(kutt, palette, []);
		expect(rest.button).toEqual({ fill: '#2196f3', ink: 'ink', radiusPx: null });
		expect(rest.shadow).toBe('0 5px 6px rgb(33 150 243 / 0.5)');
		expect(hover.button?.fill).toBe('#1976d2');
		expect(hover.shadow).toBe('0 6px 15px rgb(25 118 210 / 0.5)');
		expect(card).toMatchObject({ name: 'card', button: null, shadow: '0 1px 2px rgb(16 16 26 / 0.04)' });
	});

	it("gives the button the brand's button corner, and its base shade when no hover shade is given", () => {
		const corners = [{ name: 'card', value: '12px', px: 12, usage: '' }, { name: 'pill', value: '999px', px: 999, usage: 'Buttons and chips' }];
		const [, hover] = shadowSamples(kutt, [row('Primary', '#2196f3')], corners);
		expect(hover.button).toEqual({ fill: '#2196f3', ink: 'ink', radiusPx: 999 });
		expect(shadowSamples(kutt, palette, [{ name: 'btn', value: '6px', px: 6, usage: '' }])[0].button?.radiusPx).toBe(6);
	});

	it('draws a button shadow under a plain surface while the brand gives no primary colour', () => {
		const [rest] = shadowSamples(kutt, [], []);
		expect(rest).toMatchObject({ button: null, shadow: '0 5px 6px rgb(21 23 28 / 0.22)' });
	});
});
