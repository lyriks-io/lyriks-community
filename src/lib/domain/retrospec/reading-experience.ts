import type { RetroItem, RetrospecSpec } from './reading';
import { clean, firstSentence, plural } from './reading-text';

/**
 * The Experience of the review: the brand (colors, logo, type), each journey
 * with its steps, the screens and the components. Pure.
 */

export function experienceItems(spec: RetrospecSpec): Omit<RetroItem, 'ref'>[] {
	const x = spec.experience;
	const brand = x.brand;
	const base = { tab: 'experience' as const, rejectable: false };
	const out: Omit<RetroItem, 'ref'>[] = [];
	const swatches = brand.colors.tokens.filter((t) => clean(t.value)).map((t) => ({ name: clean(t.name) || clean(t.usage) || t.value, color: clean(t.value) }));
	if (swatches.length > 0) out.push({ ...base, id: 'exp:branding', title: 'Branding', desc: `${plural(swatches.length, 'color')} extracted from the interface.`, swatches });
	const logos = brand.logo.variants.map((v) => clean(v.label) || clean(v.role)).filter(Boolean);
	if (logos.length > 0) out.push({ ...base, id: 'exp:logo', title: 'Logo', desc: `${plural(logos.length, 'variant')} of the logo.`, chips: logos });
	const families = brand.typography.families;
	const family = [families.heading.stack, families.body.stack].map(clean).filter(Boolean);
	if (family.length > 0) {
		const unique = [...new Set(family)];
		const sizes = brand.typography.scale.map((s) => s.valuePx).filter((v) => v > 0);
		const weights = brand.typography.weights.map((w) => w.value).filter((v) => v > 0);
		const detail = [unique.join(' / '), sizes.length > 0 ? `${sizes.join(' / ')} px` : '', weights.length > 0 ? `weights ${weights.join(', ')}` : ''].filter(Boolean).join(' · ');
		out.push({ ...base, id: 'exp:typography', title: 'Typography', desc: unique.length === 1 ? `A single family, ${unique[0]}.` : `${unique.length} families.`, typography: { family: unique[0], detail } });
	}
	const journeys = [...x.journeys].sort((a, b) => a.order - b.order);
	for (const journey of journeys) {
		const steps = x.steps.filter((s) => s.journeyId === journey.id).sort((a, b) => a.order - b.order).map((s) => clean(s.name)).filter(Boolean);
		out.push({ tab: 'experience', rejectable: false, id: `journey:${journey.id}`, title: `Journey · ${clean(journey.name) || journey.id}`, desc: firstSentence(journey.description), ...(steps.length > 0 ? { steps } : {}) });
	}
	const screens = x.screens.map((s) => clean(s.name)).filter(Boolean);
	if (screens.length > 0) out.push({ ...base, id: 'exp:screens', title: 'Screens', desc: `${plural(screens.length, 'screen')} found in the product.`, chips: screens });
	const components = x.components.map((c) => clean(c.name)).filter(Boolean);
	if (components.length > 0) out.push({ ...base, id: 'exp:components', title: 'Components', desc: `${plural(components.length, 'interface component')}.`, chips: components });
	return out;
}
