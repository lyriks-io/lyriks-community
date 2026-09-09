/**
 * Step 05 — Simulator design system. A small but complete theme the user authors
 * once and that drives how the Experience builder canvas AND the Run-mode player
 * render: brand/accent, surfaces, text, border, corner radius, font family, and a
 * spacing density that scales every group's padding and gap (the simulator's
 * margins). Emitted as CSS custom properties onto a scope element; NodeRenderer
 * reads them so a theme change re-skins the whole simulator live.
 */
import type { Option } from '$domain/shared';

/* ── Font ─────────────────────────────────────────────────────────────── */
export type SimFont = 'sans' | 'serif' | 'mono' | 'rounded';
export const SIM_FONTS = [
	{ code: 'sans', label: 'Sans · Inter' },
	{ code: 'serif', label: 'Serif' },
	{ code: 'mono', label: 'Mono' },
	{ code: 'rounded', label: 'Rounded' }
] as const satisfies readonly Option[];
const FONT_STACK: Record<SimFont, string> = {
	sans: 'ui-sans-serif, system-ui, "Inter", "Segoe UI", sans-serif',
	serif: 'ui-serif, Georgia, "Times New Roman", serif',
	mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
	rounded: '"SF Pro Rounded", ui-rounded, "Nunito", "Quicksand", system-ui, sans-serif'
};

/* ── Corner radius ────────────────────────────────────────────────────── */
export type SimRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export const SIM_RADII = [
	{ code: 'none', label: 'Square' },
	{ code: 'sm', label: 'Small' },
	{ code: 'md', label: 'Medium' },
	{ code: 'lg', label: 'Large' },
	{ code: 'xl', label: 'XL' },
	{ code: 'full', label: 'Pill' }
] as const satisfies readonly Option[];
const RADIUS_PX: Record<SimRadius, string> = {
	none: '0px',
	sm: '4px',
	md: '8px',
	lg: '12px',
	xl: '18px',
	full: '9999px'
};

/* ── Interaction: hover effect (global, per interactive kind) ─────────── */
export type HoverEffect = 'none' | 'darken' | 'lighten' | 'lift' | 'grow' | 'underline';
export const SIM_HOVERS = [
	{ code: 'none', label: 'None' },
	{ code: 'darken', label: 'Darken' },
	{ code: 'lighten', label: 'Lighten' },
	{ code: 'lift', label: 'Lift' },
	{ code: 'grow', label: 'Grow' },
	{ code: 'underline', label: 'Underline' }
] as const satisfies readonly Option[];
/** The `:hover` declaration body for each effect — shared by the renderer + CSS export. */
export const HOVER_CSS: Record<HoverEffect, string> = {
	none: '',
	darken: 'filter: brightness(0.92);',
	lighten: 'filter: brightness(1.08);',
	lift: 'transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.12);',
	grow: 'transform: scale(1.03);',
	underline: 'text-decoration: underline;'
};

/* ── Spacing density (drives padding + gap = the simulator's margins) ───── */
export type SimDensity = 'compact' | 'cozy' | 'comfortable';
export const SIM_DENSITIES = [
	{ code: 'compact', label: 'Compact' },
	{ code: 'cozy', label: 'Cozy' },
	{ code: 'comfortable', label: 'Comfortable' }
] as const satisfies readonly Option[];
/** Base spacing unit (px). A group's p-{n}/gap-{n} scale value is multiplied by this. */
const SPACE_PX: Record<SimDensity, number> = { compact: 3, cozy: 4, comfortable: 6 };

/* ── Viewport / device format (adapts to the project's form factors) ───── */
export type SimViewport =
	| 'auto'
	| 'mobile'
	| 'tablet'
	| 'small'
	| 'medium'
	| 'large'
	| 'full'
	| 'cli';
export const SIM_VIEWPORTS = [
	{ code: 'auto', label: 'Auto (match project)' },
	{ code: 'mobile', label: 'Mobile' },
	{ code: 'tablet', label: 'Tablet' },
	{ code: 'small', label: 'Small page' },
	{ code: 'medium', label: 'Medium page' },
	{ code: 'large', label: 'Large page' },
	{ code: 'full', label: 'Full width' },
	{ code: 'cli', label: 'CLI / Terminal' }
] as const satisfies readonly Option[];

/** Max-width (CSS) for each concrete viewport. */
const VIEWPORT_WIDTH: Record<Exclude<SimViewport, 'auto'>, string> = {
	mobile: '380px',
	tablet: '760px',
	small: '460px',
	medium: '680px',
	large: '1024px',
	full: '100%',
	cli: '820px'
};

/**
 * Concrete viewport implied by a project's Step-01 form factors. The array is
 * ordered by the user's priority, so the FIRST mappable form factor wins (a
 * web-first product with a secondary mobile target renders as a large page).
 */
const FORM_FACTOR_VIEWPORT: Record<string, Exclude<SimViewport, 'auto'>> = {
	cli: 'cli',
	tui: 'cli',
	mobile_touch: 'mobile',
	tablet_kiosk: 'tablet',
	text_chatbot: 'medium',
	voice_assistant: 'medium',
	web_interface: 'large',
	desktop_gui: 'full'
};
export function viewportFromFormFactors(codes: readonly string[]): Exclude<SimViewport, 'auto'> {
	for (const c of codes) {
		const v = FORM_FACTOR_VIEWPORT[c];
		if (v) return v;
	}
	return 'large';
}

/** Resolve `auto` against the project form factors; pass-through otherwise. */
export function resolveViewport(
	viewport: SimViewport,
	formFactors: readonly string[]
): Exclude<SimViewport, 'auto'> {
	return viewport === 'auto' ? viewportFromFormFactors(formFactors) : viewport;
}

export function viewportMaxWidth(viewport: Exclude<SimViewport, 'auto'>): string {
	return VIEWPORT_WIDTH[viewport] ?? VIEWPORT_WIDTH.large;
}

/** A CLI/terminal frame renders dark + monospace regardless of the color theme. */
export function isTerminalViewport(viewport: Exclude<SimViewport, 'auto'>): boolean {
	return viewport === 'cli';
}

/** CSS-var overrides that re-skin a subtree as a dark terminal (for `cli` viewport). */
export function terminalStyleVars(): string {
	return [
		'--sim-surface:#0f1419',
		'--sim-bg:#0b0e14',
		'--sim-ink:#e6e1cf',
		'--sim-muted:#8a9199',
		'--sim-border:#2a2f3a',
		'--sim-accent:#7fd962',
		'--sim-on-accent:#0b0e14',
		'--sim-font:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
	].join(';');
}

/* ── The theme ────────────────────────────────────────────────────────── */
/** Corner radius per element type — global, NOT per clicked node. */
export interface SimRadii {
	button: SimRadius;
	input: SimRadius;
	/** Surfaces: the device card, groups, forms, containers, images. */
	card: SimRadius;
}
/** Hover behavior per interactive type — global. */
export interface SimHover {
	button: HoverEffect;
	link: HoverEffect;
}

export interface SimTheme {
	/** Primary/brand color — buttons, links, accents. */
	accent: string;
	/** Text/icon color drawn on top of `accent`. */
	onAccent: string;
	/** Card / surface background inside the device frame. */
	surface: string;
	/** Canvas backdrop behind the device frame. */
	bg: string;
	/** Primary text color. */
	ink: string;
	/** Secondary / muted text color. */
	muted: string;
	/** Border / divider color. */
	border: string;
	/** Per-type corner radius (button ≠ input ≠ card). */
	radii: SimRadii;
	/** Per-type hover effect. */
	hover: SimHover;
	font: SimFont;
	density: SimDensity;
	/** Device/page format; `auto` follows the project's form factors. */
	viewport: SimViewport;
}

export function defaultSimTheme(): SimTheme {
	return {
		accent: '#6d28d9',
		onAccent: '#ffffff',
		surface: '#ffffff',
		bg: '#f4f4f7',
		ink: '#171723',
		muted: '#6b7280',
		border: '#e5e7eb',
		radii: { button: 'md', input: 'md', card: 'lg' },
		hover: { button: 'darken', link: 'underline' },
		font: 'sans',
		density: 'cozy',
		viewport: 'auto'
	};
}

/* Fixed status colors inside the simulated app — legible on any user theme
   because they pair with a color-mixed surface tint, never a raw background. */
const SIM_DANGER = '#dc2626';
const SIM_SUCCESS = '#059669';

/** Px value for a single radius token. */
export function radiusPx(r: SimRadius): string {
	return RADIUS_PX[r] ?? RADIUS_PX.lg;
}

/** Base spacing unit (px) for the active density. */
export function spaceUnitPx(t: SimTheme): number {
	return SPACE_PX[t.density] ?? SPACE_PX.cozy;
}

/**
 * CSS custom properties for a simulator scope element (the canvas/player root).
 * Children read `var(--sim-*)`; spacing uses `calc(var(--sim-space) * n)`.
 */
export function themeStyleVars(t: SimTheme): string {
	return [
		`--sim-accent:${t.accent}`,
		`--sim-on-accent:${t.onAccent}`,
		`--sim-surface:${t.surface}`,
		`--sim-bg:${t.bg}`,
		`--sim-ink:${t.ink}`,
		`--sim-muted:${t.muted}`,
		// The raw token, plus the effective color every renderer reads. `markerStyleVars`
		// re-declares `--sim-border` on top of this to apply the Border style trait.
		`--sim-border-base:${t.border}`,
		`--sim-border:var(--sim-border-base)`,
		`--sim-danger:${SIM_DANGER}`,
		`--sim-success:${SIM_SUCCESS}`,
		`--sim-radius-button:${radiusPx(t.radii.button)}`,
		`--sim-radius-input:${radiusPx(t.radii.input)}`,
		`--sim-radius-card:${radiusPx(t.radii.card)}`,
		`--sim-font:${FONT_STACK[t.font]}`,
		`--sim-space:${spaceUnitPx(t)}px`
	].join(';');
}

/* ── Deterministic export: CSS / Tailwind ─────────────────────────────── */
/** Ordered semantic tokens — single source for every export format. */
function themeTokens(t: SimTheme) {
	return {
		colors: {
			accent: t.accent,
			'accent-foreground': t.onAccent,
			surface: t.surface,
			background: t.bg,
			ink: t.ink,
			muted: t.muted,
			border: t.border
		},
		radius: {
			button: radiusPx(t.radii.button),
			input: radiusPx(t.radii.input),
			card: radiusPx(t.radii.card)
		},
		space: `${spaceUnitPx(t)}px`,
		fontFamily: FONT_STACK[t.font].split(',').map((s) => s.trim())
	};
}

/** `.sim-button:hover { … }` style rules for the chosen hover effects (deterministic). */
function hoverRules(t: SimTheme): string {
	const rule = (sel: string, fx: HoverEffect) =>
		fx === 'none' ? '' : `${sel} { transition: all 0.15s ease; }\n${sel}:hover { ${HOVER_CSS[fx]} }\n`;
	return [rule('.sim-button', t.hover.button), rule('.sim-link', t.hover.link)].filter(Boolean).join('');
}

/** A `:root { … }` CSS custom-property block + hover rules. Pure function of the theme. */
export function toCssTheme(t: SimTheme): string {
	const k = themeTokens(t);
	const lines = [
		...Object.entries(k.colors).map(([name, val]) => `  --color-${name}: ${val};`),
		`  --radius-button: ${k.radius.button};`,
		`  --radius-input: ${k.radius.input};`,
		`  --radius-card: ${k.radius.card};`,
		`  --space: ${k.space};`,
		`  --font-sans: ${k.fontFamily.join(', ')};`
	];
	const hover = hoverRules(t);
	return `:root {\n${lines.join('\n')}\n}\n${hover ? `\n${hover}` : ''}`;
}

/** A `tailwind.config` `theme.extend` snippet. Pure function of the theme. */
export function toTailwindTheme(t: SimTheme): string {
	const k = themeTokens(t);
	const config = {
		theme: {
			extend: {
				colors: k.colors,
				borderRadius: { button: k.radius.button, input: k.radius.input, card: k.radius.card },
				spacing: { sim: k.space },
				fontFamily: { sim: k.fontFamily }
			}
		}
	};
	const hover = `// hover — button: ${t.hover.button}, link: ${t.hover.link}`;
	return `/** Generated from the Lyriks simulator design system. */\n${hover}\nmodule.exports = ${JSON.stringify(config, null, 2)};\n`;
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Named palette presets — one-shot authoring sugar so a prototype stops looking
 * like every other one without hand-picking seven hex values. `theme.preset`
 * fills the color fields at coercion time; any explicitly-set color still wins,
 * and the persisted theme holds the concrete colors (the preset is not stored).
 */
export const SIM_THEME_PRESETS: Record<
	string,
	Pick<SimTheme, 'accent' | 'onAccent' | 'surface' | 'bg' | 'ink' | 'muted' | 'border'>
> = {
	light: {
		accent: '#6d28d9',
		onAccent: '#ffffff',
		surface: '#ffffff',
		bg: '#f4f4f7',
		ink: '#171723',
		muted: '#6b7280',
		border: '#e5e7eb'
	},
	dark: {
		accent: '#8b5cf6',
		onAccent: '#ffffff',
		surface: '#1e293b',
		bg: '#0f172a',
		ink: '#f1f5f9',
		muted: '#94a3b8',
		border: '#334155'
	},
	midnight: {
		accent: '#22d3ee',
		onAccent: '#082f49',
		surface: '#111827',
		bg: '#030712',
		ink: '#e5e7eb',
		muted: '#9ca3af',
		border: '#1f2937'
	},
	paper: {
		accent: '#b45309',
		onAccent: '#ffffff',
		surface: '#fffdf7',
		bg: '#f5efe2',
		ink: '#292524',
		muted: '#78716c',
		border: '#e7e0d0'
	},
	forest: {
		accent: '#059669',
		onAccent: '#ffffff',
		surface: '#ffffff',
		bg: '#f0f7f2',
		ink: '#1a2e22',
		muted: '#5f7268',
		border: '#d7e5da'
	}
};

/** Anti-corruption coercion for a persisted/garbled theme payload. */
export function coerceSimTheme(raw: unknown): SimTheme {
	const base = defaultSimTheme();
	if (typeof raw !== 'object' || raw === null) return base;
	const r = raw as Record<string, unknown>;
	// A recognised preset swaps the color DEFAULTS; explicit fields still win.
	const preset = typeof r.preset === 'string' ? SIM_THEME_PRESETS[r.preset] : undefined;
	const d = preset ? { ...base, ...preset } : base;
	const hex = (v: unknown, f: string) => (isHex(v) ? v : f);
	const RADII = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
	const HOVERS = ['none', 'darken', 'lighten', 'lift', 'grow', 'underline'] as const;
	// Legacy: a single `radius` once styled everything — fall back to it per kind.
	const legacy = typeof r.radius === 'string' ? oneOf<SimRadius>(r.radius, RADII, d.radii.card) : null;
	const rr = typeof r.radii === 'object' && r.radii ? (r.radii as Record<string, unknown>) : {};
	const rh = typeof r.hover === 'object' && r.hover ? (r.hover as Record<string, unknown>) : {};
	return {
		accent: hex(r.accent, d.accent),
		onAccent: hex(r.onAccent, d.onAccent),
		surface: hex(r.surface, d.surface),
		bg: hex(r.bg, d.bg),
		ink: hex(r.ink, d.ink),
		muted: hex(r.muted, d.muted),
		border: hex(r.border, d.border),
		radii: {
			button: oneOf<SimRadius>(rr.button, RADII, legacy ?? d.radii.button),
			input: oneOf<SimRadius>(rr.input, RADII, legacy ?? d.radii.input),
			card: oneOf<SimRadius>(rr.card, RADII, legacy ?? d.radii.card)
		},
		hover: {
			button: oneOf<HoverEffect>(rh.button, HOVERS, d.hover.button),
			link: oneOf<HoverEffect>(rh.link, HOVERS, d.hover.link)
		},
		font: oneOf<SimFont>(r.font, ['sans', 'serif', 'mono', 'rounded'], d.font),
		density: oneOf<SimDensity>(r.density, ['compact', 'cozy', 'comfortable'], d.density),
		viewport: oneOf<SimViewport>(
			r.viewport,
			['auto', 'mobile', 'tablet', 'small', 'medium', 'large', 'full', 'cli'],
			d.viewport
		)
	};
}
