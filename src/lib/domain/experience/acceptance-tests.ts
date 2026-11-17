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
import { screenPath } from './draft';
import { buildAcceptanceSpec, type AcceptanceAssertion, type JourneyFlow } from './acceptance';
import { fieldStatePath, type BuilderElementNode } from './builder';
import { simulate } from './simulate';
import { NBSP, quoteName, type SpecLanguage } from '$domain/language';

/** The prose the generated tests carry, in the language of the spec; code stays code. */
const TEXTS = {
	en: {
		completes: (journey: string) => `completes the "${journey}" journey`,
		simulationFailed:
			'The prototype simulation failed. Repair and re-verify it before accepting this generated test.',
		mapInteraction: 'Map this scripted interaction to a real UI assertion before accepting the journey.',
		unverifiedPath: (gap: string) => `Unverified prototype path: ${gap}`,
		criterion: (title: string, screen: string, trigger: string) => `${title} (on "${screen}", on ${trigger})`,
		bindManually: (text: string) => `acceptance (bind manually): ${text}`
	},
	fr: {
		completes: (journey: string) => `réalise le parcours ${quoteName('fr', journey)}`,
		simulationFailed:
			"La simulation du prototype a échoué. Réparez-la et vérifiez-la de nouveau avant d'accepter ce test généré.",
		mapInteraction:
			"Associez cette interaction scriptée à une vraie vérification de l'interface avant d'accepter le parcours.",
		unverifiedPath: (gap: string) => `Chemin du prototype non vérifié${NBSP}: ${gap}`,
		criterion: (title: string, screen: string, trigger: string) =>
			`${title} (sur ${quoteName('fr', screen)}, au déclencheur ${quoteName('fr', trigger)})`,
		bindManually: (text: string) => `acceptation (à relier à la main)${NBSP}: ${text}`
	}
} as const;

/** The header of the generated spec file in French; the English one stays where it always was. */
const FRENCH_HEADER = [
	`// Tests d'acceptation E2E, générés depuis le prototype Experience vérifié.`,
	`// Ciblent les routes et les noms accessibles (à surcharger par une TargetMap ou lyriks.map.json).`
];

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
	if (['input', 'textarea', 'select', 'checkbox'].includes(kind)) return `page.getByLabel(${q(label)})`;
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
	counts: { bound: number; annotated: number },
	lang: SpecLanguage = 'en'
): string {
	const t = TEXTS[lang];
	const lines: string[] = [];
	lines.push(`  test(${q(t.completes(f.name))}, async ({ page }) => {`);
	const entry = f.startScreenId
		? routeFor(map, f.startScreenId, f.stops[0]?.screen ?? '', f.entryPath ?? '/')
		: f.entryPath;
	if (entry) {
		lines.push(`    await page.goto(${q(entry)});`);
		lines.push(`    await expect(page).toHaveURL(${urlRe(entry)});`);
	}
	const run = simulate(draft.builder, { startScreenId: f.startScreenId, actions: f.script });
	if (!run.ok) lines.push(`    test.fixme(true, ${q(t.simulationFailed)});`);
	for (const [index, action] of f.script.entries()) {
		const result = run.actions[index];
		const node = result?.resolvedNodeId ? draft.builder.nodes[result.resolvedNodeId] : null;
		if (node?.kind !== 'element' || action.tab !== undefined || action.expectError) {
			lines.push(`    test.fixme(true, ${q(t.mapInteraction)});`);
			continue;
		}
		const baseLocator = locator(node.label || 'element', node.elementKind, map);
		const loc = action.rowIndex !== undefined ? `${baseLocator}.nth(${action.rowIndex})` : baseLocator;
		if (action.type !== undefined) {
			if (node.elementKind === 'checkbox') lines.push(`    await ${loc}.${action.type === 'true' ? 'check' : 'uncheck'}();`);
			else if (node.elementKind === 'select') lines.push(`    await ${loc}.selectOption(${q(action.type)});`);
			else lines.push(`    await ${loc}.fill(${q(action.type)});`);
		} else {
			const trigger = result.trigger;
			const method = trigger === 'hover' ? 'hover()' : trigger === 'submit' ? "press('Enter')" : trigger === 'change' ? "dispatchEvent('change')" : 'click()';
			lines.push(`    await ${loc}.${method};`);
		}
		if (result.screenAfter && result.screenAfter !== result.screenBefore) {
			const screen = draft.screens.find((s) => s.id === result.screenAfter);
			if (screen) {
				const dest = routeFor(map, screen.id, screen.name, screenPath(screen));
				lines.push(`    await expect(page).toHaveURL(${urlRe(dest)});`);
			}
		}
	}
	for (const gap of f.flowGaps) lines.push(`    test.fixme(true, ${q(t.unverifiedPath(gap))});`);
	for (const c of f.criteria) {
		lines.push(`    // ${t.criterion(c.title, c.screen, c.whenTrigger)}`);
		for (const then of c.then) {
			const obs = observableFor(draft, then, map);
			if (obs) {
				lines.push(`    ${obs}`);
				counts.bound++;
			} else {
				lines.push(`    // ${t.bindManually(then.text)}`);
				counts.annotated++;
			}
		}
	}
	lines.push('  });');
	return lines.join('\n');
}

export function generateAcceptanceTests(
	draft: ProjectExperienceDraft,
	map: TargetMap = {},
	lang: SpecLanguage = 'en'
): AcceptanceTests {
	const spec = buildAcceptanceSpec(draft, lang);
	const counts = { bound: 0, annotated: 0 };
	const out: string[] = [
		...(lang === 'fr'
			? FRENCH_HEADER
			: [
					`// Acceptance E2E — generated from the verified Experience prototype.`,
					`// Targets routes + accessible names (override via a TargetMap / lyriks.map.json).`
				]),
		`import { test, expect } from '@playwright/test';`,
		''
	];
	for (const f of spec.features) {
		if (!f.entryPath && f.criteria.length === 0) continue;
		out.push(`test.describe(${q(f.name)}, () => {`);
		out.push(journeyBlock(draft, f, map, counts, lang));
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
