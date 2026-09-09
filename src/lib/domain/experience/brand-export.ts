/**
 * "Export LLM brief" — deterministic, pure serializers of the brand model.
 *
 * Three shapes for a downstream model: a Markdown brief, a tokens JSON bundle,
 * and CSS custom properties. Ported from the prototype; no IO, no side effects.
 */
import { resolveMarkers, type ProjectBrand } from './brand';

function safe(v: unknown): string {
	return (v ?? '').toString().trim();
}

/** Tokens + identity + resolved markers as a JSON-serializable object. */
export function brandExportJson(brand: ProjectBrand): unknown {
	const id = brand.identity;
	const colors = brand.colors;
	const typo = brand.typography;
	const f = brand.foundation;
	const tokens = {
		color: colors.tokens.reduce<Record<string, unknown>>(
			(m, t) => (t.name ? { ...m, [t.name]: { value: t.value, usage: t.usage } } : m),
			{}
		),
		semantic: Object.fromEntries(Object.entries(colors.semantic).filter(([, v]) => safe(v))),
		typography: {
			families: typo.families,
			size: typo.scale.reduce<Record<string, unknown>>(
				(m, t) => (t.name ? { ...m, [t.name]: { px: t.valuePx, lineHeight: t.lineHeight, usage: t.usage } } : m),
				{}
			),
			weight: typo.weights.reduce<Record<string, unknown>>(
				(m, t) => (t.name ? { ...m, [t.name]: { value: t.value, usage: t.usage } } : m),
				{}
			)
		},
		space: f.space.reduce<Record<string, unknown>>(
			(m, t) => (t.name ? { ...m, [t.name]: { px: t.valuePx, usage: t.usage } } : m),
			{}
		),
		radius: f.radius.reduce<Record<string, unknown>>(
			(m, t) => (t.name ? { ...m, [t.name]: { px: t.valuePx, usage: t.usage } } : m),
			{}
		),
		shadow: f.shadow.reduce<Record<string, unknown>>(
			(m, t) => (t.name ? { ...m, [t.name]: { value: t.value, usage: t.usage } } : m),
			{}
		),
		breakpoints: f.breakpoints.reduce<Record<string, unknown>>(
			(m, t) => (t.name ? { ...m, [t.name]: { px: t.valuePx, usage: t.usage } } : m),
			{}
		)
	};
	const mr = resolveMarkers(brand);
	return {
		brand: {
			name: id.name,
			baseline: id.baseline,
			mission: id.missionOneLiner,
			tone: { adjectives: id.toneAdjectives, doSay: id.toneDoSay, dontSay: id.toneDontSay },
			visualPersonality: id.visualPersonality,
			brandbook: { summary: id.brandbookSummary, url: id.brandbookUrl, file: id.brandbookFile?.name ?? null }
		},
		tokens,
		markers: {
			values: brand.markers,
			css: {
				radius: mr.radius,
				padding: mr.padding,
				shadow: mr.shadow,
				border: mr.border,
				transition: mr.transition,
				textTransform: mr.textTransform
			}
		},
		components: brand.components,
		pages: brand.pages.map((p) => ({ ...p, screenshotRefs: p.screenshotRefs.map((s) => ({ name: s.name })) })),
		examples: brand.examples
	};
}

/** `:root { … }` CSS custom properties, incl. resolved design markers. */
export function brandExportCss(brand: ProjectBrand): string {
	const lines: string[] = [':root {'];
	brand.colors.tokens.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.value};`);
	});
	Object.entries(brand.colors.semantic).forEach(([k, v]) => {
		if (safe(v)) lines.push(`  --color-semantic-${k}: ${v};`);
	});
	brand.typography.scale.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.valuePx}px;`);
	});
	brand.typography.weights.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.value};`);
	});
	brand.foundation.space.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.valuePx}px;`);
	});
	brand.foundation.radius.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.valuePx}px;`);
	});
	brand.foundation.shadow.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.value};`);
	});
	brand.foundation.breakpoints.forEach((t) => {
		if (t.name) lines.push(`  --${t.name}: ${t.valuePx}px;`);
	});
	const mr = resolveMarkers(brand);
	lines.push(`  --ui-radius: ${mr.radius};`);
	lines.push(`  --ui-padding: ${mr.padding};`);
	lines.push(`  --ui-shadow: ${mr.shadow};`);
	lines.push(`  --ui-border: ${mr.border};`);
	lines.push(`  --ui-transition: ${mr.transition};`);
	lines.push(`  --ui-text-transform: ${mr.textTransform};`);
	lines.push('}');
	return lines.join('\n');
}

/** A human-readable Markdown brief covering the whole brand. */
export function brandExportMarkdown(brand: ProjectBrand): string {
	const id = brand.identity;
	const out: string[] = [];
	out.push(`# Brand brief, ${id.name || 'Untitled'}`);
	if (id.baseline) out.push(`\n> ${id.baseline}\n`);
	if (id.missionOneLiner) out.push(`**Mission.** ${id.missionOneLiner}\n`);
	if (id.toneAdjectives.length) out.push(`**Tone.** ${id.toneAdjectives.join(', ')}\n`);
	if (id.visualPersonality) out.push(`**Visual personality.** ${id.visualPersonality}\n`);
	if (id.toneDoSay) out.push(`### Do say\n\n${id.toneDoSay}\n`);
	if (id.toneDontSay) out.push(`### Don't say\n\n${id.toneDontSay}\n`);

	out.push('\n## Logo & assets\n');
	const lr = brand.logo.rules;
	if (lr.clearSpace) out.push(`- **Clear space.** ${lr.clearSpace}`);
	if (lr.backgroundsAllowed) out.push(`- **Allowed backgrounds.** ${lr.backgroundsAllowed}`);
	if (lr.backgroundsForbidden) out.push(`- **Forbidden.** ${lr.backgroundsForbidden}`);
	if (lr.additionalDoDont) out.push(`\n${lr.additionalDoDont}`);
	if (brand.logo.variants.length) {
		out.push('\n**Variants available**');
		brand.logo.variants.forEach((v) =>
			out.push(`- ${v.label || 'variant'}${v.file ? ` (${v.file.name})` : ''}${v.url ? `, ${v.url}` : ''}`)
		);
	}

	const tokens = brand.colors.tokens;
	if (tokens.length || Object.values(brand.colors.semantic).some((v) => safe(v))) {
		out.push('\n## Colors\n');
		if (tokens.length) {
			out.push('| Token | Value | Usage |');
			out.push('|---|---|---|');
			tokens.forEach((t) => out.push(`| \`${t.name}\` | \`${t.value}\` | ${t.usage} |`));
		}
		const semRows = Object.entries(brand.colors.semantic).filter(([, v]) => safe(v));
		if (semRows.length) {
			out.push('\n**Semantic mapping**');
			semRows.forEach(([k, v]) => out.push(`- \`${k}\` → \`${v}\``));
		}
	}

	const typo = brand.typography;
	if (Object.keys(typo.families).length || typo.scale.length || typo.weights.length) {
		out.push('\n## Typography\n');
		Object.entries(typo.families).forEach(([slot, f]) => {
			if (f.stack || f.fallback) out.push(`- **${slot}.** ${f.stack || ''}${f.fallback ? `, fallback: ${f.fallback}` : ''}`);
		});
		if (typo.scale.length) {
			out.push('\n| Size | Px | Line height | Usage |');
			out.push('|---|---|---|---|');
			typo.scale.forEach((s) => out.push(`| \`${s.name}\` | ${s.valuePx} | ${s.lineHeight} | ${s.usage} |`));
		}
		if (typo.weights.length) {
			out.push('\n| Weight | Value | Usage |');
			out.push('|---|---|---|');
			typo.weights.forEach((w) => out.push(`| \`${w.name}\` | ${w.value} | ${w.usage} |`));
		}
	}

	const f = brand.foundation;
	const renderFoundation = (
		list: { name: string; valuePx?: number; value?: string; usage: string }[],
		title: string,
		isText: boolean
	) => {
		if (!list.length) return;
		out.push(`\n## ${title}\n`);
		out.push('| Token | Value | Usage |');
		out.push('|---|---|---|');
		list.forEach((t) => out.push(`| \`${t.name}\` | ${isText ? `\`${t.value}\`` : `${t.valuePx}px`} | ${t.usage} |`));
	};
	renderFoundation(f.space, 'Spacing', false);
	renderFoundation(f.radius, 'Border radius', false);
	renderFoundation(f.shadow, 'Shadows', true);
	renderFoundation(f.breakpoints, 'Breakpoints', false);

	if (Object.keys(brand.markers).length) {
		out.push('\n## Design markers\n');
		out.push('These markers govern the look across every component. Use the CSS column when generating code.\n');
		out.push('| Marker | Choice | Concrete CSS |');
		out.push('|---|---|---|');
		const mr = resolveMarkers(brand);
		const cssByKey: Record<string, string> = {
			cornerStyle: `border-radius: ${mr.radius}`,
			density: `padding: ${mr.padding}`,
			shadowStyle: `box-shadow: ${mr.shadow}`,
			borderStyle: `border: ${mr.border}`,
			motion: `transition: ${mr.transition}`,
			caseStyle: `text-transform: ${mr.textTransform}`,
			iconStyle: `icon style: ${mr.iconStyle}`,
			typeContrast: `type contrast: ${mr.typeContrast}`,
			accentLevel: `accent use: ${mr.accentLevel}`
		};
		Object.entries(brand.markers).forEach(([k, v]) => {
			out.push(`| \`${k}\` | ${v} | \`${cssByKey[k] || v}\` |`);
		});
	}

	if (brand.components.length) {
		out.push('\n## Components\n');
		out.push('Each component is an Experience element / composed component mapped to brand tokens. Apply the design markers above on top.\n');
		brand.components.forEach((c) => {
			out.push(`### ${c.refName || 'Component'}${c.refKind ? ` (${c.refKind})` : ''}`);
			const t = c.tokens;
			const tokenLines = [
				t.bgColor && `  - background: \`${t.bgColor}\``,
				t.textColor && `  - text      : \`${t.textColor}\``,
				t.fontFamily && `  - font family: \`${t.fontFamily}\``,
				t.fontSize && `  - font size : \`${t.fontSize}\``,
				t.fontWeight && `  - font weight: \`${t.fontWeight}\``
			].filter(Boolean) as string[];
			if (tokenLines.length) {
				out.push('- **Token mapping**');
				tokenLines.forEach((line) => out.push(line));
			}
			if (c.variants.length) out.push(`- **Variants.** ${c.variants.join(', ')}`);
			if (c.states.length) out.push(`- **States.** ${c.states.join(', ')}`);
			if (c.dos) out.push(`\n**DO**\n\n${c.dos}`);
			if (c.donts) out.push(`\n**DON'T**\n\n${c.donts}`);
			if (c.codeExample) out.push('\n```\n' + c.codeExample + '\n```');
			out.push('');
		});
	}

	if (brand.pages.length) {
		out.push('\n## Pages & layouts\n');
		brand.pages.forEach((p) => {
			out.push(`### ${p.type || 'page'}`);
			if (p.principles) out.push(p.principles);
			if (p.densityNote) out.push(`\n*Density.* ${p.densityNote}`);
			if (p.referenceUrls.length) out.push(`\n*References.* ${p.referenceUrls.join(', ')}`);
			out.push('');
		});
	}

	if (brand.examples.length) {
		out.push('\n## Examples (good vs bad)\n');
		brand.examples.forEach((e) => {
			out.push(`### ${e.title || 'Example'}`);
			if (e.goodSnippet) out.push(`**DO.** ${e.goodSnippet}`);
			if (e.goodCode) out.push('\n```\n' + e.goodCode + '\n```');
			if (e.badSnippet) out.push(`\n**DON'T.** ${e.badSnippet}`);
			if (e.badCode) out.push('\n```\n' + e.badCode + '\n```');
			if (e.explanation) out.push(`\n*Why.* ${e.explanation}`);
			out.push('');
		});
	}

	return out.join('\n');
}
