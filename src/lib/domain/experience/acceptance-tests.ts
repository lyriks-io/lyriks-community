/**
 * The last mile: turn a VERIFIED prototype into runnable acceptance tests the
 * real product must pass — so verification becomes the build's contract.
 *
 * Two artifacts from one source:
 *   - a Gherkin `.feature` — the human/BDD contract (journeys + scenarios);
 *   - a Playwright `.spec.ts` — per journey it `goto`s the entry route, clicks the
 *     navigating element (by role + accessible name) at each hop, asserts the URL
 *     advances, and — crucially — emits REAL assertions for the authored
 *     scenarios by mining the prototype's own wiring (a state the scenario asserts
 *     is mapped to the element it makes visible / the text it fills / the input it
 *     sets). Where the prototype can't say, it falls back to an annotation.
 *
 * `TargetMap` retargets the SAME spec onto an EXISTING codebase with no git
 * provider needed: override a screen's route or an element's selector, or pin a
 * state path to an explicit observable. Pure functions only.
 */
import type { ProjectExperienceDraft } from './draft';
import { buildAcceptanceSpec, type AcceptanceAssertion, type JourneyFlow } from './acceptance';
import { fieldStatePath, type BuilderElementNode } from './builder';

/** Maps the prototype onto a real app (existing projects); every field optional. */
export interface TargetMap {
	/** Screen id OR name → real route, e.g. {"Login":"/auth/sign-in"}. */
	routes?: Record<string, string>;
	/** Element label → real CSS selector, e.g. {"Continue":"[data-testid=submit]"}. */
	selectors?: Record<string, string>;
	/** State path → explicit observable, when the prototype can't auto-derive one. */
	observables?: Record<
		string,
		{ kind: 'url' | 'text' | 'visible' | 'hidden' | 'value'; value?: string; selector?: string }
	>;
}

export interface AcceptanceTests {
	gherkin: string;
	playwright: string;
	journeyCount: number;
	criteriaCount: number;
	/** Then-clauses that became real assertions vs. left as manual annotations. */
	boundAssertions: number;
	annotatedAssertions: number;
}

const q = (s: string): string => JSON.stringify(s);
const reEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const urlRe = (path: string): string => `/${reEscape(path)}/`;

const allElements = (draft: ProjectExperienceDraft): BuilderElementNode[] =>
	Object.values(draft.builder.nodes).filter((n): n is BuilderElementNode => n.kind === 'element');

/** Playwright locator for an element by label — a mapped selector wins. */
function locator(label: string, kind: string, map: TargetMap): string {
	const sel = map.selectors?.[label];
	if (sel) return `page.locator(${q(sel)})`;
	if (kind === 'button') return `page.getByRole('button', { name: ${q(label)} })`;
	if (kind === 'link') return `page.getByRole('link', { name: ${q(label)} })`;
	if (kind === 'input') return `page.getByLabel(${q(label)})`;
	return `page.getByText(${q(label)})`;
}

const routeFor = (
	map: TargetMap,
	screenId: string | null,
	screenName: string,
	fallback: string
): string => (screenId && map.routes?.[screenId]) || map.routes?.[screenName] || fallback;

/**
 * Derive a REAL Playwright assertion for a scenario's Then-clause by reading what
 * the prototype already wired: an explicit observable map wins; else a state path
 * the scenario asserts is matched to the element it gates (visibleWhen), the input
 * whose value it is, or the text that interpolates it. Returns null if nothing in
 * the prototype expresses the state observably (→ caller annotates it instead).
 */
function observableFor(
	draft: ProjectExperienceDraft,
	a: AcceptanceAssertion,
	map: TargetMap
): string | null {
	const explicit = map.observables?.[a.path];
	if (explicit) {
		const loc = explicit.selector ? `page.locator(${q(explicit.selector)})` : null;
		if (explicit.kind === 'url') return `await expect(page).toHaveURL(${urlRe(explicit.value ?? '')});`;
		if (explicit.kind === 'text')
			return `await expect(page.getByText(${q(explicit.value ?? '')})).toBeVisible();`;
		if (explicit.kind === 'visible' && loc) return `await expect(${loc}).toBeVisible();`;
		if (explicit.kind === 'hidden' && loc) return `await expect(${loc}).toBeHidden();`;
		if (explicit.kind === 'value' && loc) return `await expect(${loc}).toHaveValue(${q(explicit.value ?? '')});`;
	}

	const els = allElements(draft);
	// 1) State that gates an element's visibility → assert that element shows/hides.
	const gated = els.find((e) => e.wiring.visibleWhen?.path === a.path);
	if (gated) {
		const loc = locator(gated.label || 'element', gated.elementKind, map);
		return a.op === 'falsy'
			? `await expect(${loc}).toBeHidden();`
			: `await expect(${loc}).toBeVisible();`;
	}
	// 2) State that is an input's bound value → assert the input's value (eq only).
	if (a.op === 'eq') {
		const input = els.find((e) => e.elementKind === 'input' && fieldStatePath(e) === a.path);
		if (input)
			return `await expect(${locator(input.label || 'field', 'input', map)}).toHaveValue(${q(a.expected ?? '')});`;
	}
	// 3) State interpolated into a text/heading label → assert that text appears (eq only).
	if (a.op === 'eq' && a.expected) {
		const token = `{${a.path}}`;
		const shows = els.find(
			(e) => (e.elementKind === 'text' || e.elementKind === 'heading') && e.label.includes(token)
		);
		if (shows) return `await expect(page.getByText(${q(a.expected)})).toBeVisible();`;
	}
	return null;
}

function journeyBlock(
	draft: ProjectExperienceDraft,
	f: JourneyFlow,
	map: TargetMap,
	counts: { bound: number; annotated: number }
): string {
	const lines: string[] = [];
	lines.push(`  test(${q(`completes the "${f.name}" journey`)}, async ({ page }) => {`);
	const entry = f.startScreenId
		? routeFor(map, f.startScreenId, f.stops[0]?.screen ?? '', f.entryPath ?? '/')
		: f.entryPath;
	if (entry) {
		lines.push(`    await page.goto(${q(entry)});`);
		lines.push(`    await expect(page).toHaveURL(${urlRe(entry)});`);
	}
	for (const hop of f.hops) {
		const dest = routeFor(map, hop.toScreenId, hop.toScreen, hop.toPath);
		lines.push(`    await ${locator(hop.viaLabel, hop.viaKind, map)}.click();`);
		lines.push(`    await expect(page).toHaveURL(${urlRe(dest)}); // → ${hop.toScreen}`);
	}
	for (const g of f.flowGaps) lines.push(`    // GAP (fix in the prototype first): ${g}`);
	for (const c of f.criteria) {
		lines.push(`    // ${c.title} (on "${c.screen}", on ${c.whenTrigger})`);
		for (const t of c.then) {
			const obs = observableFor(draft, t, map);
			if (obs) {
				lines.push(`    ${obs}`);
				counts.bound++;
			} else {
				lines.push(`    // acceptance (bind manually): ${t.text}`);
				counts.annotated++;
			}
		}
	}
	lines.push('  });');
	return lines.join('\n');
}

export function generateAcceptanceTests(
	draft: ProjectExperienceDraft,
	map: TargetMap = {}
): AcceptanceTests {
	const spec = buildAcceptanceSpec(draft);
	const counts = { bound: 0, annotated: 0 };
	const out: string[] = [
		`// Acceptance E2E — generated from the verified Experience prototype.`,
		`// Targets routes + accessible names (override via a TargetMap / lyriks.map.json).`,
		`import { test, expect } from '@playwright/test';`,
		''
	];
	for (const f of spec.features) {
		if (!f.entryPath && f.criteria.length === 0) continue;
		out.push(`test.describe(${q(f.name)}, () => {`);
		out.push(journeyBlock(draft, f, map, counts));
		out.push(`});`, '');
	}
	return {
		gherkin: spec.gherkin,
		playwright: out.join('\n').trim() + '\n',
		journeyCount: spec.features.length,
		criteriaCount: spec.criteriaCount,
		boundAssertions: counts.bound,
		annotatedAssertions: counts.annotated
	};
}
