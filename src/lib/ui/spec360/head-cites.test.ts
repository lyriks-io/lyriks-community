import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BlockControls from '$ui/evolution/BlockControls.svelte';

/** Every head of the Specification 360° closes its text with Comment and its sources, its validation right after them (owner 2026-11-07). */

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
const SPEC = 'routes/projects/[projectId]/spec';

describe('what a head is about closes its text with its comments and its sources, its cross and its check right after them [criterion:14a1164c]', () => {
	it('closes the text of a core feature, a feature and a user with the links, then the small acts', () => {
		const head = read('lib/ui/spec360/page/HeadText.svelte');
		expect(head).toContain('{@render text?.()}{#if !mode.active}<CiteLinks {anchor} />{/if}<SpecControls {anchor} {title} {values} {remove} inline cites trailing />');
		for (const page of ['lib/ui/spec360/features/CoreFeaturePage.svelte', `${SPEC}/features/[featureId]/+page.svelte`, `${SPEC}/users/[userId]/+page.svelte`]) {
			const source = read(page);
			expect(source, page).toContain('<HeadText ');
			// No group of controls floats at the far side of the head any more.
			expect(source, page).not.toMatch(/<SpecControls \{?anchor[^/]*inline \/>/);
		}
	});

	it('closes the Overview summary the same way, its controls under the chips only in the Edit mode', () => {
		const overview = read(`${SPEC}/+page.svelte`);
		expect(overview).toContain('<CiteLinks anchor="product" />{#if g.pitch}<SpecControls anchor="product" title="Product summary" values={product} inline cites trailing />{/if}');
		expect(overview).toContain('{#if g.pitch && mode.active}');
	});

	it('never repeats among the facts the count of sources the links give', () => {
		expect(read(`${SPEC}/users/[userId]/+page.svelte`)).not.toContain("plural(cited, 'source')");
		expect(read(`${SPEC}/features/[featureId]/+page.svelte`)).not.toContain("counted(cited, 'source')");
	});

	it('closes the lead of every page that lists with the links of what it bears on, as Ask my AI does', () => {
		const pageHead = read('lib/ui/spec360/page/PageHead.svelte');
		expect(pageHead).toContain('<CiteLinks anchor={cite.anchor} />');
		expect(pageHead).toContain('{#if cite?.foot}');
		expect(read(`${SPEC}/features/+page.svelte`)).toContain('cite={PRODUCT_CITE}');
		expect(read(`${SPEC}/glossary/+page.svelte`)).toContain('cite={PRODUCT_CITE}');
		expect(read(`${SPEC}/noticed/+page.svelte`)).toContain('cite={PRODUCT_CITE}');
		expect(read(`${SPEC}/users/+page.svelte`)).toContain("cite={{ anchor: 'permissions', title: 'Permissions' }}");
		expect(read(`${SPEC}/users/matrix/+page.svelte`)).toContain("cite={{ anchor: 'permissions', title: 'Permissions', validates: true, foot: true }}");
		expect(read(`${SPEC}/experience/+page.svelte`)).toContain("cite={{ anchor: 'branding', title: 'Branding' }}");
		expect(read(`${SPEC}/tech/+layout.svelte`)).toContain('cite={asked}');
	});
});

describe('the cross and the check of a head are small and sit next to what they validate [criterion:a4ef7658]', () => {
	const validate = { state: 'next', run: () => {}, stamps: [] } as never;

	it('draws 28 px squares on the text line, never pushed to the far side', () => {
		const small = render(BlockControls, { props: { icons: true, small: true, comments: { count: 0, resolvedOnly: false, open: false, toggle: () => {} }, validate } }).body;
		expect(small).toContain('data-four-acts-small');
		expect(small).toContain('inline-flex');
		expect(small).toContain('size-7');
		expect(small).not.toContain('ml-auto');
		const card = render(BlockControls, { props: { icons: true, end: true, comments: { count: 0, resolvedOnly: false, open: false, toggle: () => {} }, validate } }).body;
		expect(card).toContain('ml-auto');
		expect(card).not.toContain('data-four-acts-small');
	});

	it('keeps the next check to validate outlined and flat, only tinted blue', () => {
		const css = read('app.css');
		const rule = css.slice(css.indexOf('[data-four-acts] button[data-evo-validate][data-evo-next] {'));
		expect(rule).toContain('box-shadow: none;');
		expect(rule).toContain('background-color: var(--color-blue-tint);');
	});
});
