import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every block of the Overview carries the standard review control, the feature page's, beside its frame's Validate
 * all (criterion e20318e7, owner 2026-11-16). Read from the components' sources, which a server render cannot reach
 * without the page's contexts.
 */
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('the Overview validates block by block and frame by frame [criterion:e20318e7]', () => {
	it('draws the problem and target cards with the standard review control, in the bottom right corner, a held thread kept in reach', () => {
		const cards = source('./ProblemTarget.svelte');
		expect(cards).toContain('<SpecControls {anchor} {title} {values} discussed={heldThread(anchor)} inline />');
		expect(cards).toMatch(/class="mt-auto flex flex-wrap justify-end empty:hidden" data-card-marks/);
		expect(cards).not.toContain('validates={false}');
	});

	it('reads Symptoms and Results under the two texts, and says so while a draft leaves them empty', () => {
		const cards = source('./ProblemTarget.svelte');
		expect(cards).toContain('>Symptoms<');
		expect(cards).toContain('>Results<');
		expect(cards).toContain('No symptom written yet.');
		expect(cards).toContain('No result written yet.');
	});

	it('shows the frames\' fresh Validate all at rest', () => {
		const page = source('../../../../routes/projects/[projectId]/spec/+page.svelte');
		expect(page).toContain('sectionId="kb-why" always');
		expect(page).toContain('sectionId="kb-what" always');
	});

	it('ends a core feature card on its count at its left and its standard review control at its right', () => {
		const cores = source('./CoreList.svelte');
		expect(cores).toContain('values={v} discussed={false} inline');
		expect(cores).not.toContain('validates={false}');
		expect(cores).toMatch(/justify-between[^"]*"[^>]*>\s*<CountMeter/);
	});
});

describe('Who uses it offers fresh approval to its profiles as a whole [criterion:90232fe6]', () => {
	it('carries Validate all over its profiles, shown at rest, and the page counts them', () => {
		const page = source('../../../../routes/projects/[projectId]/spec/+page.svelte');
		expect(page).toContain(`const userAnchors = $derived(users.map((u) => anchorOf('role', u.id)));`);
		expect(page).toContain('<SectionValidateAll anchors={userAnchors} what="profiles" sectionId="kb-who" always />');
		expect(page).toContain("const pageAnchors = $derived([...(g.pitch ? ['product'] : []), ...why, ...coreAnchors, ...userAnchors]);");
	});

	it('carries the standard review control on each profile', () => {
		const list = source('./UserList.svelte');
		expect(list).toContain("<OwnValidation anchor={anchorOf('role', u.id)} title={u.name} />");
		expect(source('./OwnValidation.svelte')).toContain('<SpecControls {anchor} {title} discussed={false} inline />');
	});
});

describe('the Overview lists who uses the product, each line centred [criterion:90232fe6]', () => {
	it('keeps as much room above the first line as below the last', () => {
		const list = source('./UserList.svelte');
		expect(list).toContain('bg-toner px-4 py-1');
		expect(list).not.toMatch(/pt-0\.5 pb-2/);
	});
});

describe("the Overview's validation reads in the band at the top of Knowledge [criterion:f480783f]", () => {
	it('hands its scope to the band instead of drawing a bar of its own', () => {
		expect(source('../../../../routes/projects/[projectId]/spec/+page.svelte')).toContain(
			'<FeatureValidation anchors={pageAnchors} sectionId="kb-glance" kicker="Validation of this page" />'
		);
		const declared = source('../FeatureValidation.svelte');
		expect(declared).toContain('slot?.hold({ anchors, sectionId, label: kicker.toLowerCase(), path: page.url.pathname');
		expect(declared).not.toMatch(/<div|<span|<button/);
	});
});

describe('the two cards of Why it exists say which is the problem and which the target [criterion:71338aeb]', () => {
	it('opens the red card on THE PROBLEM and the green one on THE TARGET, in the ink of their tint', () => {
		const cards = source('./ProblemTarget.svelte');
		expect(cards).toContain('<h3 class="{TITLE} m-0 text-red-ink">The problem</h3>');
		expect(cards).toContain('<h3 class="{TITLE} m-0 text-green-ink">The target</h3>');
		expect(cards.indexOf('>The problem<')).toBeLessThan(cards.indexOf('>Symptoms<'));
		expect(cards.indexOf('>The target<')).toBeLessThan(cards.indexOf('>Results<'));
	});
});

describe("in the Edit mode each chip of the product's type says what it fills [criterion:3bb5b091]", () => {
	it('names each group in the Edit mode, and each chip in its tooltip outside it', () => {
		const page = source('../../../../routes/projects/[projectId]/spec/+page.svelte');
		expect(page).toContain('{#if mode.active}<span class="font-evo-mono text-[0.625rem] leading-[1.3] tracking-[0.08em] text-ink-3 uppercase" data-dimension>{group.dimension}</span>{/if}');
		expect(page).toContain('title="{group.dimension}: {label}"');
	});
});

describe('a card or a row cuts a long name or description, whole in its tooltip [criterion:f5fdaf55]', () => {
	it('cuts a core feature card after three lines of name and four of description, breaking a word too long', () => {
		const cores = source('./CoreList.svelte');
		expect(cores).toMatch(/title=\{v\.text\}[^>]*line-clamp-3/);
		expect(cores).toMatch(/title=\{v\.desc\}[^>]*line-clamp-4/);
		expect(cores).toContain("const CUT = '[overflow-wrap:anywhere]';");
	});

	it('cuts a long row name after two lines and keeps its complete description readable', () => {
		const row = source('../page/OpenRow.svelte');
		expect(row).toContain('<strong class="{NAME} line-clamp-2" title={shown.text}>');
		expect(row).not.toContain('line-clamp-2 [overflow-wrap:anywhere]" title={shown.desc}');
		expect(row).toContain('class="{DESC} [overflow-wrap:anywhere]"');
		// The fields of the Edit mode are never cut: StagedText carries no clamp.
		expect(row).not.toMatch(/<StagedText[^>]*line-clamp/);
	});
});
