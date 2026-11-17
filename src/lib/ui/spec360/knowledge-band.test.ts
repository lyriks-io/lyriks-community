import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PageScopeSlot } from './page-scope.svelte';
import { pageAsk, standingTip } from './page-validation';

/**
 * The top of Knowledge (criterion 8e942b12 of feat-feedback-docs) and the page's validation merged into its band
 * (criterion f480783f). The rows are read from the components' sources, which a server render cannot reach without
 * the layout's contexts; what the band says is tested on its pure helpers.
 */
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe("a page's validation says first what it asks of the reader [criterion:f480783f]", () => {
	const page = (ok: number, waiting: number, todo: number) => ({ ok, waiting, todo, total: ok + waiting + todo });

	it('opens on how many elements wait for the reader, the number set apart', () => {
		expect(pageAsk(page(0, 0, 9), 9)).toEqual({ lead: '9', text: 'elements here wait for your validation', done: false });
		expect(pageAsk(page(8, 0, 1), 1)).toEqual({ lead: '1', text: 'element here waits for your validation', done: false });
	});

	it('says what is left to the others once the reader is done, and reads green once all is validated', () => {
		expect(pageAsk(page(5, 4, 0), 0)).toEqual({ lead: null, text: 'Nothing waits for you here: 4 still wait for others', done: false });
		expect(pageAsk(page(9, 0, 0), 0)).toEqual({ lead: null, text: 'Everything here is validated', done: true });
		expect(pageAsk(page(0, 0, 0), 0).text).toBe('Nothing to validate on this page');
	});

	it('keeps the whole standing for the tooltip of its gauge', () => {
		expect(standingTip(page(3, 2, 4))).toBe('3 of 9 validated by everyone they wait on · 2 waiting for others · 4 not validated yet');
		expect(standingTip(page(9, 0, 0))).toBe('9 of 9 validated by everyone they wait on');
	});
});

describe('the page on screen holds the band while it shows [criterion:f480783f]', () => {
	it('gives the band its scope, and takes it back when it goes, never the next page\'s', () => {
		const slot = new PageScopeSlot();
		const first = { anchors: ['product'], sectionId: 'kb-glance', label: 'validation of this page' };
		const next = { anchors: ['feature:f1'], sectionId: 'kb-feature-f1', label: 'validation of this feature' };
		const release = slot.hold(first);
		expect(slot.scope).toBe(first);
		const releaseNext = slot.hold(next);
		release();
		expect(slot.scope).toBe(next);
		releaseNext();
		expect(slot.scope).toBeNull();
	});
});

describe('the band reads the page\'s validation, the reader\'s own and the whole specification\'s [criterion:f480783f]', () => {
	const band = source('./KnowledgeBar.svelte');

	it('says what the page asks, its gauge and count, right after DRAFT · TO VALIDATE', () => {
		expect(band.indexOf('<span class="pill">{band.pill}</span>')).toBeLessThan(band.indexOf('data-ask'));
		expect(band).toContain('<span class="num">{p.ok} / {p.total}</span>');
		expect(band).toContain('title={standingTip(p)}');
	});

	it('offers Validate all section on the page, never a whole-specification shortcut [criterion:d7cd4e43]', () => {
		expect(band).toContain('{#if draft && mine > 0 && scope}');
		expect(band).toMatch(/class="act fill" title="Validate the \{mine\} [^"]+ of this section still waiting on you" onclick=\{\(\) => validateSection\(scope\)\}\s*>Validate all section</);
		expect(band).not.toContain('Validate my');
		// Only the Features page's own scope goes to the server whole; nothing reaches the whole specification.
		expect(band).toContain("validation.validateAllInSpec(open, on.sectionId, 'features')");
		expect(band.match(/validateAllInSpec\(/g)).toHaveLength(1);
	});

	it('offers it to every reviewer the page waits on, editing rights or not [criterion:43bef20d]', () => {
		expect(band).toContain('const mine = $derived(scope ? validation.waitingOnMe(open).length : 0);');
	});

	it('carries no count and no bar of the whole specification [criterion:d7cd4e43]', () => {
		expect(band).not.toContain('>Spec <span');
		expect(band).not.toContain('class="whole"');
		expect(band).not.toContain('class="bar"');
		expect(band).toMatch(/\{:else if !draft \|\| !handsOwn\}[\s\S]*?<span class="txt">\{band\.text\}<\/span>/);
	});

	it('never reads the scope of the page being left, and says nothing of a page that hands its own until it shows [criterion:c509fa9c]', () => {
		expect(band).toContain('const held = $derived(slot?.scope && slot.scope.path === path ? slot.scope : null);');
		expect(band).toContain('const scope = $derived(held ?? viewScope);');
		expect(source('./FeatureValidation.svelte')).toContain("path: page.url.pathname.replace(/\\/+$/, '')");
	});

	it('no page repeats it as a check with a count in its head [criterion:d7cd4e43]', () => {
		const features = readFileSync(new URL('../../../routes/projects/[projectId]/spec/features/+page.svelte', import.meta.url), 'utf8');
		expect(features).not.toContain('ValidateAllCheck');
		expect(features).not.toContain('validateAllInSpec');
	});

	it('no page draws a validation bar of its own any more', () => {
		expect(source('./FeatureValidation.svelte')).not.toContain('data-page-validation');
		expect(band).toContain('data-page-validation={scope ? true : undefined}');
	});
});

describe('Knowledge holds the product\'s name, its chapters and where it stands, in view while the page scrolls [criterion:8e942b12]', () => {
	const band = source('./KnowledgeBar.svelte');

	it('stacks the name with DRAFT and Edit, then the tab bar, then the band, in that order', () => {
		const name = band.indexOf('class="kname"');
		const tabs = band.indexOf('<nav bind:this={strip} class="ktabs"');
		const standing = band.indexOf('<div class="ksb"');
		expect(name).toBeGreaterThan(0);
		expect(name).toBeLessThan(tabs);
		expect(tabs).toBeLessThan(standing);
	});

	it('puts Edit right after the DRAFT tag, on the name\'s line [criterion:41514698]', () => {
		const draft = band.indexOf('{#if draft}<span class={TAG_DRAFT}');
		const edit = band.indexOf('<span class="ktools"><EditTool /></span>');
		expect(draft).toBeGreaterThan(0);
		expect(edit).toBeGreaterThan(draft);
		expect(band.indexOf('<nav')).toBeGreaterThan(edit);
	});

	it('closes the name\'s row with the version line, so the band keeps one line', () => {
		const row = band.slice(band.indexOf('<div class="khead">'), band.indexOf('<nav bind:this={strip}'));
		expect(row).toContain('<a href="{base}/retrospec" title={line.title}>{line.text}</a>');
		expect(band).toMatch(/\.ver \{\s*display: flex;\s*flex: none;\s*margin-left: auto;/);
	});

	it('sticks at the top of the page on a wide screen and scrolls with it on a phone', () => {
		const rows = source('./knowledge-rows.css');
		expect(rows).toMatch(/\.kbar \{\s*position: sticky;\s*top: 0;/);
		expect(rows).toMatch(/@media \(max-width: 760px\) \{\s*\.kbar \{\s*position: relative;/);
		expect(band).toContain('data-sticky-head');
	});

	it('leaves a page\'s own head to scroll under it [criterion:14a1164c]', () => {
		const head = source('./page/PageHead.svelte');
		expect(head).toContain("class=\"{sticks ? 'sticky top-0 z-20' : ''}");
		expect(head).toContain('const sticks = $derived(!headed());');
		expect(source('../../../routes/projects/[projectId]/spec/+layout.svelte')).toContain('provideKnowledgeHead(() => knowledge);');
	});

	it('gives the Overview no head of its own: its title is the product\'s name [criterion:416e4885]', () => {
		expect(source('../../../routes/projects/[projectId]/spec/+page.svelte')).toContain('<PageHead title={data.spec.productName} bare>');
		expect(band).toContain("<svelte:element this={overview ? 'h1' : 'p'} class=\"kname\">{productName}</svelte:element>");
	});

	it('keeps Edit out of every page\'s own tools', () => {
		for (const page of [
			'../../../routes/projects/[projectId]/spec/+page.svelte',
			'../../../routes/projects/[projectId]/spec/features/+page.svelte',
			'../../../routes/projects/[projectId]/spec/features/[featureId]/+page.svelte',
			'../../../routes/projects/[projectId]/spec/users/+page.svelte',
			'../../../routes/projects/[projectId]/spec/glossary/+page.svelte',
			'./features/CoreFeaturePage.svelte'
		])
			expect(source(page), page).not.toContain('<EditTool');
	});
});

describe('the cross is gone for whoever validated the element [criterion:a4ef7658]', () => {
	it('offers the cross only to an editor who has not validated it', () => {
		expect(source('./RejectAct.svelte')).toContain('!!validation.standing(anchor) && !validation.mine(anchor)');
	});
});

describe('Validate all of a frame is the check of the four acts, with its count [criterion:aba60be7]', () => {
	it('draws the same check, its count beside it, never a filled worded button', () => {
		const check = source('./ValidateAllCheck.svelte');
		expect(check).toContain('<Icon name="check" size={14} />{count}');
		expect(check).toContain('border-[1.5px] border-ink bg-paper');
		expect(check).not.toContain('Validate all (');
		expect(source('./SectionValidateAll.svelte')).toContain('<ValidateAllCheck ');
	});
});

describe('a page under another names it as its way up [criterion:14a1164c]', () => {
	it('links a feature to its core feature, in the kicker', () => {
		expect(source('../../../routes/projects/[projectId]/spec/features/[featureId]/+page.svelte')).toContain(
			'<PageHead kicker="Feature" up={{ label: f.coreName, href: `${base}/${corePath(encodeURIComponent(f.coreId))}` }}'
		);
	});
});
