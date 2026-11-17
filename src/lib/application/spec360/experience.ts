import { compareNames, sortByName } from '$domain/shared';
import {
	BRAND_MARKER_DEFS,
	BRAND_PALETTE_ROLES,
	BRAND_SEMANTIC_KEYS,
	BRAND_SHADE_STATES,
	colorToHex,
	type BrandMarkerKey,
	type BrandPaletteRole,
	type BrandSemanticKey,
	type BrandShadeState,
	type ProjectBrand,
	type ProjectExperienceDraft
} from '$domain/experience';
import { counted, text } from './labels';

/**
 * The Experience as the Specification 360° reads it: the visual identity the
 * screens are drawn with, the key journeys step by step, and the reusable
 * components with the screens that use them. A project whose experience was
 * never authored shows none of it, never the builder's default theme.
 */

/** Repeated source identities read once; distinct paths keep their ids, even when named alike. */
function uniqueById<T extends { readonly id: string }>(rows: readonly T[]): T[] {
	const seen = new Set<string>();
	return rows.filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; });
}

export interface Swatch {
	readonly name: string;
	readonly color: string;
	/** What the colour is for, on hover. */
	readonly usage?: string;
}

/** One shade of a palette role; `color` '' = not set. */
export interface Shade {
	readonly state: string;
	readonly color: string;
	readonly hex: string | null;
}

/** A colour role of the palette (ac-brand-palette-roles): Primary, Secondary or Tertiary, in its three shades. */
export interface PaletteRow {
	readonly role: string;
	readonly shades: readonly Shade[];
}

export interface JourneyRow {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly steps: readonly string[];
}

export interface ComponentCard {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	/** The screens that place it, by name. */
	readonly usedOn: readonly string[];
	readonly usage: string;
	/** Whether a layout was designed for it (the page then previews it). */
	readonly designed: boolean;
}

/** One value of the design system, in plain words: its name, its value, what it is for. */
export interface DesignToken {
	readonly name: string;
	/** "16px · 1.45", "12px", "0 5px 6px ..." */
	readonly value: string;
	/** The value in pixels where it is one, to draw it at its size. */
	readonly px: number | null;
	readonly usage: string;
}

/** One size of the type scale: a token that also says its line height. */
export interface TypeSize extends DesignToken {
	readonly lineHeight: number | null;
}

/** The design system the screens are drawn with (ac-brand-design-system-read); an empty group is left out. */
export interface DesignSystem {
	readonly family: string;
	/** The family with the brand's own fallback, to draw the samples with (a font this app lacks falls back as the product does). */
	readonly familyCss: string;
	readonly sizes: readonly TypeSize[];
	readonly corners: readonly DesignToken[];
	readonly spacing: readonly DesignToken[];
	readonly shadows: readonly DesignToken[];
	readonly breakpoints: readonly DesignToken[];
	/** "Rounded corners", "Comfortable density"...; none while the brand was never described. */
	readonly style: readonly string[];
}

/**
 * One slot of the Colors section (ac-brand-palette-roles): a role of the
 * palette, drawn by its base shade with its hover and active shades under it
 * where the brand gives them, or a colour of text and surfaces. `color` ''
 * reads not set.
 */
export interface ColorSlot {
	readonly name: string;
	readonly color: string;
	readonly hex: string | null;
	/** The hover and active shades the brand gives, those only. */
	readonly shades: readonly Shade[];
	/** What the colour is for, on hover. */
	readonly usage?: string;
}

export interface ExperienceView {
	readonly authored: boolean;
	/** The style in a few words, as the page's lead sentence; '' when the brand says none. */
	readonly lead: string;
	/** Every colour slot, set or not; none when the brand names no colour at all. */
	readonly colors: readonly ColorSlot[];
	/** Which slots are set and which are not, in a sentence. */
	readonly colorsIntro: string;
	readonly palette: readonly PaletteRow[];
	/** The colours of text and surfaces: background, surface, text, border. */
	readonly surfaces: readonly Swatch[];
	readonly designSystem: DesignSystem;
	readonly componentNames: readonly string[];
	readonly journeys: readonly JourneyRow[];
	readonly components: readonly ComponentCard[];
}

/** What each style marker is about, so a marker reads "Rounded corners", never "cornerStyle: rounded". */
const STYLE_NOUN: Partial<Record<BrandMarkerKey, string>> = {
	cornerStyle: 'corners',
	density: 'density',
	shadowStyle: 'shadows',
	borderStyle: 'borders',
	motion: 'motion',
	iconStyle: 'icons'
};

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const tokens = (rows: readonly { name: string; valuePx: number; usage: string }[]): DesignToken[] =>
	rows.filter((r) => text(r.name) && Number.isFinite(r.valuePx)).map((r) => ({ name: text(r.name), value: px(r.valuePx), px: r.valuePx, usage: text(r.usage) }));

export function designSystemOf(brand: ProjectBrand): DesignSystem {
	const { foundation, typography, markers } = brand;
	const sizes = typography.scale
		.filter((s) => text(s.name) && Number.isFinite(s.valuePx))
		.map((s) => ({
			name: text(s.name),
			value: s.lineHeight ? `${px(s.valuePx)} · ${s.lineHeight}` : px(s.valuePx),
			px: s.valuePx,
			lineHeight: s.lineHeight || null,
			usage: text(s.usage)
		}));
	const shadows = foundation.shadow.filter((s) => text(s.name) && text(s.value)).map((s) => ({ name: text(s.name), value: text(s.value), px: null, usage: text(s.usage) }));
	const family = text(typography.families.body.stack) || text(typography.families.heading.stack);
	const described = !!family || sizes.length > 0 || foundation.radius.length + foundation.space.length + foundation.shadow.length + foundation.breakpoints.length > 0;
	const style = described
		? BRAND_MARKER_DEFS.flatMap((def) => {
				const noun = STYLE_NOUN[def.key];
				const option = def.options.find((o) => o.v === markers[def.key]);
				return noun && option ? [`${option.l} ${noun}`] : [];
			})
		: [];
	const fallback = text(typography.families.body.fallback) || text(typography.families.heading.fallback) || 'sans-serif';
	return {
		family: family.replace(/^['"]|['"]$/g, ''),
		familyCss: family ? `${family}, ${fallback}` : '',
		sizes,
		corners: tokens(foundation.radius),
		spacing: tokens(foundation.space),
		shadows,
		breakpoints: tokens(foundation.breakpoints),
		style
	};
}

/** The type scale read as a specimen, from the largest size down; sizes of one value keep their order. Pure. */
export function typeSpecimen(sizes: readonly TypeSize[]): TypeSize[] {
	return [...sizes].sort((a, b) => (b.px ?? 0) - (a.px ?? 0));
}

const NO_DESIGN_SYSTEM: DesignSystem = { family: '', familyCss: '', sizes: [], corners: [], spacing: [], shadows: [], breakpoints: [], style: [] };

/** How the page names each semantic colour, short. */
const SEMANTIC_NAME: Readonly<Record<BrandSemanticKey, string>> = {
	background: 'Background',
	surface: 'Surface',
	text: 'Text',
	textMuted: 'Muted',
	border: 'Border',
	success: 'Success',
	warning: 'Warning',
	error: 'Error',
	info: 'Info'
};
const isGradient = (value: string) => /gradient\(/i.test(value);

const ROLE_NAME: Readonly<Record<BrandPaletteRole, string>> = { primary: 'Primary', secondary: 'Secondary', tertiary: 'Tertiary' };
const STATE_NAME: Readonly<Record<BrandShadeState, string>> = { base: 'Base', hover: 'Hover', active: 'Active' };
const SURFACE_KEYS = ['background', 'surface', 'text', 'border'] as const satisfies readonly BrandSemanticKey[];

/**
 * The palette (ac-brand-palette-roles): each role in its three shades, the
 * three roles always, so a shade the brand does not give reads not set. A
 * brand described before the palette existed gives its primary through the
 * named colour that says so. Empty when the brand names no colour at all.
 */
export function paletteRows(brand: ProjectBrand): PaletteRow[] {
	const palette = brand.colors.palette;
	const given = BRAND_PALETTE_ROLES.some((role) => BRAND_SHADE_STATES.some((state) => text(palette[role][state])));
	const named = given ? undefined : brand.colors.tokens.find((t) => /primary/i.test(t.name) && text(t.value) && !isGradient(t.value));
	if (!given && !named) return [];
	const colorOf = (role: BrandPaletteRole, state: BrandShadeState) => (given ? text(palette[role][state]) : role === 'primary' && state === 'base' ? text(named?.value) : '');
	return BRAND_PALETTE_ROLES.map((role) => ({
		role: ROLE_NAME[role],
		shades: BRAND_SHADE_STATES.map((state) => {
			const color = colorOf(role, state);
			return { state: STATE_NAME[state], color, hex: color ? colorToHex(color) : null };
		})
	}));
}

/** The colours of text and surfaces the brand fills. */
export function surfaceSwatches(brand: ProjectBrand): Swatch[] {
	const labels = new Map(BRAND_SEMANTIC_KEYS.map((k) => [k.key, k.label]));
	return SURFACE_KEYS.flatMap((key) => {
		const color = text(brand.colors.semantic[key]);
		return color ? [{ name: SEMANTIC_NAME[key], color, usage: labels.get(key) }] : [];
	});
}

/** "a", "a and b", "a, b and c". */
function inWords(items: readonly string[]): string {
	return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const SURFACE_NAMES = ['Background', 'Surface', 'Text', 'Border'] as const;

/**
 * The slots of the Colors section, in the order a design manages them: the
 * three roles of the palette, then the colours of text and surfaces, each set
 * or not. A brand that names no colour at all has none to show. Pure.
 */
export function colorSlots(palette: readonly PaletteRow[], surfaces: readonly Swatch[]): ColorSlot[] {
	if (palette.length === 0 && surfaces.length === 0) return [];
	const roles = Object.values(ROLE_NAME).map((role): ColorSlot => {
		const shades = palette.find((r) => r.role === role)?.shades ?? [];
		const base = shades.find((s) => s.state === STATE_NAME.base);
		return { name: role, color: base?.color ?? '', hex: base?.hex ?? null, shades: shades.filter((s) => s !== base && s.color) };
	});
	const rest = SURFACE_NAMES.map((name): ColorSlot => {
		const swatch = surfaces.find((s) => s.name === name);
		return { name, color: swatch?.color ?? '', hex: swatch?.color ? colorToHex(swatch.color) : null, shades: [], ...(swatch?.usage ? { usage: swatch.usage } : {}) };
	});
	return [...roles, ...rest];
}

/**
 * A shadow as the page can draw it: a colour the brand names by a variable of
 * its own stylesheet (var(--button-shadow)) cannot resolve here, so it is drawn
 * in `unresolved` (a neutral grey unless the caller knows better); the value
 * itself is still read as written. Pure.
 */
export function drawableShadow(value: string, unresolved = 'rgb(21 23 28 / 0.22)'): string {
	return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, _name: string, fallback?: string) => fallback?.trim() || unresolved);
}

/** A button a shadow is drawn under: the brand's primary colour, the ink its label reads in, its corner when the brand gives one. */
export interface ShadowButton {
	readonly fill: string;
	readonly ink: 'white' | 'ink';
	readonly radiusPx: number | null;
}

/** A shadow as the page draws it (ac-leaf-ac-brand-design-system-read): under what it lifts. */
export interface ShadowSample extends DesignToken {
	/** The box-shadow the page can draw. */
	readonly shadow: string;
	/** The button it is drawn under; null for a plain surface. */
	readonly button: ShadowButton | null;
}

const BUTTON = /\b(buttons?|btns?|cta)\b/i;
const HOVER = /\b(hover|hovered|focus|focused)\b/i;

/** "#42a5f5" at half strength, the way a stylesheet tints a shadow with its button's colour. */
function tintOf(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / 0.5)`;
}

/**
 * Each shadow under what it lifts: a shadow whose name or use speaks of a
 * button is drawn under a button filled with the primary colour (its hover
 * shade for a hover or focus shadow), with the button's corner when the
 * brand gives one; a colour the stylesheet names by a variable of its own is
 * then the button's colour, as a tinted button shadow is written. Without a
 * primary colour, or for any other shadow, a plain surface. Pure.
 */
export function shadowSamples(shadows: readonly DesignToken[], palette: readonly PaletteRow[], corners: readonly DesignToken[]): ShadowSample[] {
	const primary = palette.find((r) => r.role === ROLE_NAME.primary)?.shades ?? [];
	const shade = (state: BrandShadeState) => primary.find((s) => s.state === STATE_NAME[state] && s.color);
	const corner = corners.find((c) => BUTTON.test(`${c.name} ${c.usage}`))?.px ?? null;
	return shadows.map((token) => {
		const about = `${token.name} ${token.usage}`;
		const fill = BUTTON.test(about) ? ((HOVER.test(about) && shade('hover')) || shade('base')) : undefined;
		if (!fill) return { ...token, shadow: drawableShadow(token.value), button: null };
		return {
			...token,
			shadow: fill.hex ? drawableShadow(token.value, tintOf(fill.hex)) : drawableShadow(token.value),
			button: { fill: fill.color, ink: swatchInk(fill.hex), radiusPx: corner }
		};
	});
}

/**
 * Whether a colour's value written on its swatch reads in white or in ink:
 * the one with the larger WCAG contrast against it; ink when the colour is not
 * a hex value. Pure.
 */
export function swatchInk(hex: string | null): 'white' | 'ink' {
	const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
	if (!m) return 'ink';
	const channel = (i: number) => {
		const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const l = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
	// The design's ink (#16161d) has a luminance of about 0.008.
	return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.058) ? 'white' : 'ink';
}

/**
 * The sentence above the swatches: which slots are set and which are not,
 * never more ("Set: primary, secondary (with its hover shade) and text. Not
 * set yet: tertiary, background, surface and border."). Pure.
 */
export function colorsIntro(slots: readonly ColorSlot[]): string {
	const given = (s: ColorSlot) => !!s.color || s.shades.length > 0;
	const set = slots.filter(given);
	if (set.length === 0) return 'No color is set yet.';
	const named = set.map((s) => {
		const name = s.name.toLowerCase();
		const shades = s.shades.map((sh) => sh.state.toLowerCase());
		if (!s.color) return `${name} (${inWords(shades)} ${shades.length === 1 ? 'shade' : 'shades'} only)`;
		return shades.length ? `${name} (with its ${inWords(shades)} ${shades.length === 1 ? 'shade' : 'shades'})` : name;
	});
	const missing = slots.filter((s) => !given(s)).map((s) => s.name.toLowerCase());
	if (missing.length === 0) return `Every color slot is set: ${inWords(named)}.`;
	return `Set: ${inWords(named)}. Not set yet: ${inWords(missing)}.`;
}

/**
 * The style in a few words, as a sentence ("Rounded corners, comfortable
 * density and outline icons."); a marker set to none reads "no shadows". Pure.
 */
export function styleSentence(style: readonly string[]): string {
	if (style.length === 0) return '';
	const words = style.map((w) => (/^none\s/i.test(w) ? `no ${w.slice(5).toLowerCase()}` : w.charAt(0).toLowerCase() + w.slice(1)));
	const sentence = `${inWords(words)}.`;
	return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** The sentence over the type specimen: the family, a line height all sizes share, how the sizes are drawn. Pure. */
export function typeIntro(ds: Pick<DesignSystem, 'family' | 'sizes'>): string {
	if (ds.sizes.length === 0) return ds.family ? `${ds.family}.` : '';
	const heights = [...new Set(ds.sizes.map((s) => s.lineHeight).filter((h): h is number => h !== null))];
	const shared = heights.length === 1 && ds.sizes.every((s) => s.lineHeight === heights[0]) ? `line height ${heights[0]}` : '';
	const head = [ds.family, shared].filter(Boolean).join(', ');
	const sizes = ds.sizes.length === 1 ? 'One size, drawn to scale.' : `${counted(ds.sizes.length, 'size')} from the largest, each drawn to scale.`;
	return head ? `${head}. ${sizes}` : sizes;
}

export function experienceView(draft: ProjectExperienceDraft): ExperienceView {
	const authored = draft.screens.length > 0 || draft.components.length > 0 || draft.journeys.length > 0;
	// The brand's own colours; a project authored before the brand had any keeps the builder's, as it was then drawn.
	const theme = draft.builder.theme;
	const brandPalette = paletteRows(draft.brand);
	const brandSurfaces = surfaceSwatches(draft.brand);
	const fromBuilder = brandPalette.length === 0 && brandSurfaces.length === 0;
	const palette: PaletteRow[] = !authored
		? []
		: fromBuilder && text(theme.accent)
			? [{ role: 'Primary', shades: [{ state: 'Base', color: theme.accent, hex: colorToHex(theme.accent) }, { state: 'Hover', color: '', hex: null }, { state: 'Active', color: '', hex: null }] }]
			: brandPalette;
	const surfaces: Swatch[] = !authored
		? []
		: fromBuilder
			? [
					{ name: 'Background', color: theme.bg },
					{ name: 'Surface', color: theme.surface },
					{ name: 'Text', color: theme.ink },
					{ name: 'Border', color: theme.border }
				].filter((sw) => text(sw.color) !== '')
			: brandSurfaces;

	// The journeys from A to Z, each with its steps in the order it walks them (criterion 4b3d2b4d).
	const journeys = sortByName(
		uniqueById(draft.journeys).filter((j) => text(j.name)),
		(j) => text(j.name)
	).map((j) => ({
		id: j.id,
		name: text(j.name),
		description: text(j.description),
		steps: uniqueById(draft.steps)
			.filter((s) => s.journeyId === j.id && text(s.name))
			.sort((a, b) => a.order - b.order)
			.map((s) => text(s.name))
	}));

	const screenName = new Map(draft.screens.map((s) => [s.id, text(s.name) || 'Untitled screen']));
	const usedOn = new Map<string, Set<string>>();
	for (const node of Object.values(draft.builder.nodes)) {
		const componentId = node.kind === 'group' ? node.componentId : undefined;
		const screen = screenName.get(node.surfaceId);
		if (!componentId || !screen) continue;
		const set = usedOn.get(componentId) ?? new Set<string>();
		set.add(screen);
		usedOn.set(componentId, set);
	}

	const components = sortByName(
		draft.components.filter((c) => text(c.name)),
		(c) => text(c.name)
	).map((c) => {
		const screens = [...(usedOn.get(c.id) ?? [])].sort(compareNames);
		return {
			id: c.id,
			name: text(c.name),
			description: text(c.description),
			usedOn: screens,
			usage: screens.length ? `${counted(screens.length, 'screen')} · ${screens.join(', ')}` : '',
			designed: Boolean(draft.builder.screenRoots[c.id])
		};
	});

	const designSystem = authored ? designSystemOf(draft.brand) : NO_DESIGN_SYSTEM;
	const colors = colorSlots(palette, surfaces);
	return {
		authored,
		lead: styleSentence(designSystem.style),
		colors,
		colorsIntro: colorsIntro(colors),
		palette,
		surfaces,
		designSystem,
		componentNames: components.map((c) => c.name),
		journeys,
		components
	};
}
