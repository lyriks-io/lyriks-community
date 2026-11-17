import { colorToHex, type ProjectBrand, type SystemColor, type SystemSize } from '$domain/experience';
import { designSystemOf, paletteRows, surfaceSwatches } from '../spec360/experience';

/**
 * The design system as an AI client reads it in one call (get_design_system,
 * ac-brand-design-mcp): the palette in its roles and shades, the colours of
 * text and surfaces, the type, the corners, the spacing, the shadows, the
 * breakpoints and the style, every colour also as hex; and the values a design
 * is held against (check_design), each named as the specification names it.
 */
export function designSystemReading(brand: ProjectBrand) {
	const ds = designSystemOf(brand);
	const palette = paletteRows(brand).map((row) => ({
		role: row.role,
		shades: row.shades.map((s) => ({ state: s.state.toLowerCase(), value: s.color || null, hex: s.hex }))
	}));
	const surfaces = surfaceSwatches(brand).map((s) => ({ name: s.name, value: s.color, hex: colorToHex(s.color), usage: s.usage ?? '' }));
	const colors: SystemColor[] = [
		...palette.flatMap((row) => row.shades.flatMap((s) => (s.hex ? [{ name: `${row.role} · ${s.state}`, hex: s.hex }] : []))),
		...surfaces.flatMap((s) => (s.hex ? [{ name: s.name, hex: s.hex }] : []))
	];
	const sizes: SystemSize[] = [
		...ds.sizes.flatMap((t) => (t.px !== null ? [{ kind: 'font' as const, name: t.name, px: t.px }] : [])),
		...ds.corners.flatMap((t) => (t.px !== null ? [{ kind: 'radius' as const, name: t.name, px: t.px }] : [])),
		...ds.spacing.flatMap((t) => (t.px !== null ? [{ kind: 'spacing' as const, name: t.name, px: t.px }] : []))
	];
	return {
		palette,
		surfaces,
		type: { family: ds.family, sizes: ds.sizes.map((t) => ({ name: t.name, value: t.value, px: t.px, usage: t.usage })) },
		corners: ds.corners.map((t) => ({ name: t.name, px: t.px, usage: t.usage })),
		spacing: ds.spacing.map((t) => ({ name: t.name, px: t.px, usage: t.usage })),
		shadows: ds.shadows.map((t) => ({ name: t.name, value: t.value, usage: t.usage })),
		breakpoints: ds.breakpoints.map((t) => ({ name: t.name, px: t.px, usage: t.usage })),
		style: ds.style,
		sourceIds: brand.sourceIds,
		/** What check_design holds a design against: every named colour and size of the system. */
		system: { colors, sizes }
	};
}
