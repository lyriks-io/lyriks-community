/**
 * Design markers (brand-level UI traits) and the simulator theme (the concrete
 * tokens the prototype renders with) used to ask the same question twice: corner
 * style vs per-type radii, density vs spacing. The marker is the coarse control
 * and owns those tokens — picking one writes the tokens through. Everything the
 * marker does NOT own (colors, hover, viewport, font) stays token-only, and the
 * per-type radii stay editable underneath for fine-tuning.
 */
import type { BrandMarkerKey, BrandMarkers } from './brand';
import type { SimDensity, SimRadii, SimTheme } from './theme';

/* ── Traits the theme holds as tokens (write-through) ────────────────────── */

/** Corner style → a radius for each element type (cards stay softer than controls). */
const CORNER_RADII: Record<string, SimRadii> = {
	square: { button: 'none', input: 'none', card: 'none' },
	rounded: { button: 'md', input: 'md', card: 'lg' },
	pill: { button: 'full', input: 'full', card: 'xl' }
};

/** Marker density → simulator spacing unit (the vocabularies differ, the decision doesn't). */
const MARKER_DENSITY: Record<string, SimDensity> = {
	compact: 'compact',
	comfortable: 'cozy',
	spacious: 'comfortable'
};

/** Theme patch implied by one marker choice — empty when the marker owns no token. */
export function themePatchForMarker(key: BrandMarkerKey, value: string): Partial<SimTheme> {
	if (key === 'cornerStyle') {
		const radii = CORNER_RADII[value];
		return radii ? { radii } : {};
	}
	if (key === 'density') {
		const density = MARKER_DENSITY[value];
		return density ? { density } : {};
	}
	return {};
}

/** Theme patch implied by the whole marker set — used when re-seeding a default theme. */
export function themePatchFromMarkers(markers: BrandMarkers): Partial<SimTheme> {
	return {
		...themePatchForMarker('cornerStyle', markers.cornerStyle),
		...themePatchForMarker('density', markers.density)
	};
}

/* ── Traits the renderer reads as CSS variables ──────────────────────────── */
/**
 * Shadow, border weight, motion, casing and type contrast have no `SimTheme`
 * field: they are pure presentation, so they ride alongside `themeStyleVars` as
 * custom properties on the same simulator scope element. Every renderer keeps a
 * fallback equal to the seed marker, so a scope without these vars is unchanged.
 */
const SHADOW_VARS: Record<string, { card: string; raised: string; overlay: string }> = {
	none: { card: 'none', raised: 'none', overlay: 'none' },
	subtle: {
		card: '0 1px 3px rgba(0,0,0,0.06)',
		raised: '0 1px 2px rgba(0,0,0,0.14)',
		overlay: '0 18px 50px rgba(0,0,0,0.28)'
	},
	elevated: {
		card: '0 4px 14px rgba(0,0,0,0.12)',
		raised: '0 4px 10px rgba(0,0,0,0.22)',
		overlay: '0 28px 70px rgba(0,0,0,0.38)'
	}
};

/**
 * Border trait → the effective line color (mixed off the raw token) and its width.
 * Widths are whole pixels on purpose: a browser floors a fractional border to the
 * device pixel grid, so `1.5px` renders identically to `1px` on a standard screen.
 */
const BORDER_VARS: Record<string, { color: string; width: string }> = {
	hairline: { color: 'color-mix(in srgb,var(--sim-border-base) 55%,transparent)', width: '1px' },
	soft: { color: 'var(--sim-border-base)', width: '1px' },
	strong: { color: 'color-mix(in srgb,var(--sim-border-base) 62%,#000)', width: '2px' }
};

const TRANSITION: Record<string, string> = {
	instant: '0ms linear',
	smooth: '150ms ease-out',
	playful: '280ms cubic-bezier(.34,1.56,.64,1)'
};

const TEXT_TRANSFORM: Record<string, string> = {
	'as-is': 'none',
	lowercase: 'lowercase',
	uppercase: 'uppercase'
};

/** Type contrast → the heading font size that body text is measured against. */
const HEADING_SIZE: Record<string, string> = { low: '1.05rem', medium: '1.25rem', high: '1.6rem' };

/** CSS custom properties for the traits, emitted after `themeStyleVars` on the same element. */
export function markerStyleVars(markers: BrandMarkers): string {
	const shadow = SHADOW_VARS[markers.shadowStyle] ?? SHADOW_VARS.subtle;
	const border = BORDER_VARS[markers.borderStyle] ?? BORDER_VARS.soft;
	return [
		`--sim-shadow-card:${shadow.card}`,
		`--sim-shadow-raised:${shadow.raised}`,
		`--sim-shadow-overlay:${shadow.overlay}`,
		`--sim-border:${border.color}`,
		`--sim-border-width:${border.width}`,
		`--sim-transition:${TRANSITION[markers.motion] ?? TRANSITION.smooth}`,
		`--sim-text-transform:${TEXT_TRANSFORM[markers.caseStyle] ?? TEXT_TRANSFORM['as-is']}`,
		`--sim-heading-size:${HEADING_SIZE[markers.typeContrast] ?? HEADING_SIZE.medium}`
	].join(';');
}
