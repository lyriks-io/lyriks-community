/**
 * The design system as values an AI can hold a design against
 * (ac-brand-design-mcp): every colour as hex, and a design read from a file
 * such as a Figma frame matched value by value to the nearest value of the
 * specification. Pure: colours are compared as the eye sees them (CIE76 in
 * Lab), sizes in pixels.
 */

/** "#1e88e5" for any colour a stylesheet or a design file writes plainly (#rgb, #rrggbb, rgb(), hsl()); null for a gradient or a variable. */
export function colorToHex(value: string): string | null {
	const v = value.trim().toLowerCase();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
	if (hex) {
		const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		return `#${h}`;
	}
	const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(v);
	if (rgb) return toHex([+rgb[1], +rgb[2], +rgb[3]]);
	const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/.exec(v);
	if (hsl) return toHex(hslToRgb(+hsl[1], +hsl[2] / 100, +hsl[3] / 100));
	return null;
}

const toHex = (rgb: readonly number[]) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;

function hslToRgb(h: number, s: number, l: number): number[] {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function hexToLab(hex: string): [number, number, number] {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	const xyz = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883];
	const [x, y, z] = xyz.map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How far apart two colours look: under 1 the eye sees none, under 10 they read as the same colour slightly off. */
export function colorDistance(a: string, b: string): number {
	const [l1, a1, b1] = hexToLab(a);
	const [l2, a2, b2] = hexToLab(b);
	return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A colour of the design system, named where the specification names it: "Primary · hover", "Text". */
export interface SystemColor {
	readonly name: string;
	readonly hex: string;
}

/** A size of the design system by kind: a font size, a corner radius, a spacing step. */
export interface SystemSize {
	readonly kind: SizeKind;
	readonly name: string;
	readonly px: number;
}

export type SizeKind = 'font' | 'radius' | 'spacing';
export type Fit = 'matches' | 'close' | 'outside';

/** What a design file holds, as the AI read it. */
export interface DesignInput {
	readonly colors?: readonly { readonly name?: string; readonly value: string }[];
	readonly sizes?: readonly { readonly kind: SizeKind; readonly name?: string; readonly px: number }[];
}

export interface DesignFinding {
	/** What the design calls it, and its value as given. */
	readonly name: string;
	readonly value: string;
	readonly fit: Fit;
	/** The nearest value of the design system, and how far: a colour distance, or pixels. */
	readonly nearest: string | null;
	readonly nearestValue: string | null;
	readonly distance: number | null;
	readonly say: string;
}

/** The colour distance under which two colours are one, and under which one is the other slightly off. */
export const COLOR_MATCH = 1;
export const COLOR_CLOSE = 10;
/** The pixels under which a size is the system's, and under which it is the system's slightly off. */
export const SIZE_MATCH = 0.5;
export const SIZE_CLOSE = 2;

const round = (n: number) => Math.round(n * 10) / 10;

function colorFinding(input: { readonly name?: string; readonly value: string }, colors: readonly SystemColor[]): DesignFinding {
	const name = input.name?.trim() || input.value;
	const hex = colorToHex(input.value);
	if (!hex) return { name, value: input.value, fit: 'outside', nearest: null, nearestValue: null, distance: null, say: `${name}: not a plain colour, nothing to compare.` };
	if (colors.length === 0) return { name, value: input.value, fit: 'outside', nearest: null, nearestValue: null, distance: null, say: `${name}: the design system names no colour yet.` };
	const [best] = colors.map((c) => ({ c, d: colorDistance(hex, c.hex) })).sort((x, y) => x.d - y.d);
	const fit: Fit = best.d <= COLOR_MATCH ? 'matches' : best.d <= COLOR_CLOSE ? 'close' : 'outside';
	const say =
		fit === 'matches'
			? `${name} is ${best.c.name} (${best.c.hex}).`
			: fit === 'close'
				? `${name} (${hex}) is close to ${best.c.name} (${best.c.hex}), ${round(best.d)} apart: align one on the other.`
				: `${name} (${hex}) is outside the design system; the nearest is ${best.c.name} (${best.c.hex}), ${round(best.d)} apart.`;
	return { name, value: input.value, fit, nearest: best.c.name, nearestValue: best.c.hex, distance: round(best.d), say };
}

function sizeFinding(input: { readonly kind: SizeKind; readonly name?: string; readonly px: number }, sizes: readonly SystemSize[]): DesignFinding {
	const name = input.name?.trim() || `${input.kind} ${input.px}px`;
	const own = sizes.filter((s) => s.kind === input.kind);
	if (own.length === 0) return { name, value: `${input.px}px`, fit: 'outside', nearest: null, nearestValue: null, distance: null, say: `${name}: the design system names no ${input.kind} size yet.` };
	const [best] = own.map((s) => ({ s, d: Math.abs(s.px - input.px) })).sort((x, y) => x.d - y.d);
	const fit: Fit = best.d <= SIZE_MATCH ? 'matches' : best.d <= SIZE_CLOSE ? 'close' : 'outside';
	const say =
		fit === 'matches'
			? `${name} is ${best.s.name} (${best.s.px}px).`
			: fit === 'close'
				? `${name} (${input.px}px) is close to ${best.s.name} (${best.s.px}px), ${round(best.d)}px apart.`
				: `${name} (${input.px}px) is outside the design system; the nearest is ${best.s.name} (${best.s.px}px).`;
	return { name, value: `${input.px}px`, fit, nearest: best.s.name, nearestValue: `${best.s.px}px`, distance: round(best.d), say };
}

/** Each value of a design held against the design system, and how many match, are close or fall outside it. */
export function checkDesign(system: { readonly colors: readonly SystemColor[]; readonly sizes: readonly SystemSize[] }, input: DesignInput) {
	const findings = [...(input.colors ?? []).map((c) => colorFinding(c, system.colors)), ...(input.sizes ?? []).map((s) => sizeFinding(s, system.sizes))];
	const count = (fit: Fit) => findings.filter((f) => f.fit === fit).length;
	return { matches: count('matches'), close: count('close'), outside: count('outside'), findings };
}
