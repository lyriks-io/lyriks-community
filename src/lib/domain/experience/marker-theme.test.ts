import { describe, expect, it } from 'vitest';
import { BRAND_MARKER_DEFS, defaultBrand, defaultMarkers, type BrandMarkers } from './brand';
import { markerStyleVars, themePatchForMarker, themePatchFromMarkers } from './marker-theme';
import { defaultSimTheme, themeStyleVars } from './theme';

describe('themePatchForMarker', () => {
	it('translates corner style into a radius per element type', () => {
		expect(themePatchForMarker('cornerStyle', 'square')).toEqual({
			radii: { button: 'none', input: 'none', card: 'none' }
		});
		expect(themePatchForMarker('cornerStyle', 'pill')).toEqual({
			radii: { button: 'full', input: 'full', card: 'xl' }
		});
	});

	it('translates density into the simulator spacing unit', () => {
		expect(themePatchForMarker('density', 'compact')).toEqual({ density: 'compact' });
		expect(themePatchForMarker('density', 'spacious')).toEqual({ density: 'comfortable' });
	});

	it('yields nothing for markers the theme does not hold', () => {
		expect(themePatchForMarker('motion', 'playful')).toEqual({});
		expect(themePatchForMarker('cornerStyle', 'unknown')).toEqual({});
	});
});

describe('themePatchFromMarkers', () => {
	it('covers exactly the tokens the markers own', () => {
		expect(themePatchFromMarkers(defaultMarkers())).toEqual({
			radii: { button: 'md', input: 'md', card: 'lg' },
			density: 'cozy'
		});
	});
});

describe('markerStyleVars', () => {
	const varsOf = (patch: Partial<BrandMarkers>) => {
		const out: Record<string, string> = {};
		for (const decl of markerStyleVars({ ...defaultMarkers(), ...patch }).split(';')) {
			const at = decl.indexOf(':');
			out[decl.slice(0, at)] = decl.slice(at + 1);
		}
		return out;
	};

	it('renders every trait the simulator can honor', () => {
		const strong = varsOf({
			shadowStyle: 'elevated',
			borderStyle: 'strong',
			motion: 'playful',
			caseStyle: 'uppercase',
			typeContrast: 'high'
		});
		expect(strong['--sim-shadow-card']).toBe('0 4px 14px rgba(0,0,0,0.12)');
		// Whole pixels only — a browser floors a fractional border to the pixel grid.
		expect(strong['--sim-border-width']).toBe('2px');
		expect(strong['--sim-transition']).toBe('280ms cubic-bezier(.34,1.56,.64,1)');
		expect(strong['--sim-text-transform']).toBe('uppercase');
		expect(strong['--sim-heading-size']).toBe('1.6rem');
	});

	it('drops every shadow when the trait says none', () => {
		const flat = varsOf({ shadowStyle: 'none' });
		expect(flat['--sim-shadow-card']).toBe('none');
		expect(flat['--sim-shadow-raised']).toBe('none');
		expect(flat['--sim-shadow-overlay']).toBe('none');
	});

	it('overrides the border color the theme declared, off its raw token', () => {
		// The declaration order matters: `--sim-border` must win over `themeStyleVars`.
		expect(themeStyleVars(defaultSimTheme())).toContain('--sim-border-base:#e5e7eb');
		expect(varsOf({ borderStyle: 'hairline' })['--sim-border']).toBe(
			'color-mix(in srgb,var(--sim-border-base) 55%,transparent)'
		);
	});

	it('leaves nothing dangling: a trait is rendered or declared brief-only', () => {
		const rendered = new Set(['cornerStyle', 'density', 'shadowStyle', 'borderStyle', 'motion', 'caseStyle', 'typeContrast']);
		for (const def of BRAND_MARKER_DEFS) {
			expect(rendered.has(def.key) || def.briefOnly === true).toBe(true);
		}
	});

	it('holds for the seed brand', () => {
		expect(() => markerStyleVars(defaultBrand().markers)).not.toThrow();
	});
});
