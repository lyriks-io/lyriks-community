import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { anchorDomId } from '$domain/discussions';
import { applyRetrospecActs, emptyRetrospecDocument, type PersonRef, type RetrospecDocument, type SpecElement } from '$domain/retrospec';
import { SpecValidation, type ValidationSource } from '$ui/spec360/validation.svelte';
import { SpecSourcesView } from '$ui/spec360/sources.svelte';
import PageHead from './PageHead.svelte';
import HeadText from './HeadText.svelte';
import SpecControls from '../SpecControls.svelte';
import FeaturePage from '../../../../routes/projects/[projectId]/spec/features/[featureId]/+page.svelte';

/**
 * The head of a page of Knowledge and the text of the element it is about, rendered with the real validation: the
 * way up a page names, the mark on its title's line, its comments and sources closing its text, then its cross and
 * its check (criteria 14a1164c, 416e4885, a4ef7658).
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', async (original) => ({ ...await original<object>(), useSources: () => sources }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/spec360/knowledge-head', () => ({ knowledgeHeadAbove: () => () => knowledge.above }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', () => ({ getRuleVerdicts: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const bob = { id: 'bob@example.test', name: 'Bob Li' };
const elements: SpecElement[] = ['product', 'feature:refunds', 'core:billing'].map((id) => ({ id, title: id }));
const mode = { active: false, available: true };
const knowledge = { above: true };
// The real view of the page's sources, read from an index the test fills.
const cited: Record<string, string[]> = {};
const sources = new SpecSourcesView('p', () => ({ byAnchor: cited, codeCounts: {}, groupsByAnchor: {} }));
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, value: object) => value,
	current: (_anchor: string, value: object) => value,
	edited: () => false, gone: () => false, changed: () => false,
	shape: () => ({ text: true, desc: true }), added: () => [], naming: () => false,
	notEditing: (ids: readonly string[]) => ids
};
let source: ValidationSource;
let validation: SpecValidation;

function approve(doc: RetrospecDocument, itemId: string, actor: PersonRef = ana): RetrospecDocument {
	const result = applyRetrospecActs(doc, [{ op: 'validate', itemId, title: itemId, tab: 'spec360' }], { actor, now: '2026-11-18T02:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
function reset(overrides: Partial<ValidationSource> = {}) {
	source = { projectId: 'p', me: bob, canWrite: true, doc: approve(emptyRetrospecDocument(), 'outside'), elements,
		team: [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['product'] }], baselines: [], ...overrides };
	validation = new SpecValidation(() => source);
}

const clean = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
const words = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
const head = (props: Record<string, unknown>) => clean(render(PageHead, { props: { title: 'Refunds', ...props } as never }).body);
const headText = (anchor = 'feature:refunds') => clean(render(HeadText, { props: { anchor, title: 'Refunds', text: words('Return a payment.') } }).body);
/** Where the cross, the check, the comments link and the sources link stand in a piece of markup. */
const places = (html: string) => ({
	cross: html.indexOf('aria-label="Request a change: Refunds"'),
	check: html.indexOf('data-evo-validate'),
	comments: html.indexOf('title="Open the comments"'),
	sources: html.indexOf('title="Open the sources"')
});

beforeEach(() => {
	mode.active = false;
	knowledge.above = true;
	for (const anchor of Object.keys(cited)) delete cited[anchor];
	reset();
});
afterEach(() => { vi.clearAllMocks(); });

describe('the head of a page of Knowledge [criterion:14a1164c]', () => {
	it("names the page it sits under as a link before its kicker, its way up", () => {
		const html = head({ kicker: 'Feature', up: { label: 'Billing', href: '/projects/p/spec/features/billing' } });
		expect(html).toMatch(/<a href="\/projects\/p\/spec\/features\/billing"[^>]*>Billing<\/a> ·\s*Feature/);
		expect(html.indexOf('>Billing</a>')).toBeLessThan(html.indexOf('<h1'));
	});

	it("carries a mark on its title's line, right after the title [criterion:8e942b12]", () => {
		const html = head({ mark: words('Draft') });
		expect(html).toMatch(/<\/h1>\s*<span>Draft<\/span>/);
	});

	it("scrolls under Knowledge's rows, and keeps its first part at the top elsewhere", () => {
		expect(head({})).not.toContain('data-page-head');
		knowledge.above = false;
		expect(head({})).toContain('data-page-head');
	});

	it('leaves its first part out on a bare page, its title being the product name above it [criterion:416e4885]', () => {
		const html = head({ bare: true, lead: 'A ledger.' });
		expect(html).not.toContain('<h1');
		expect(html).toContain('A ledger.');
	});

	it('closes the lead of a page that lists with the links of what it bears on, as Ask my AI does', () => {
		cited.product = ['brief.md', 'pitch.pdf'];
		const lead = head({ lead: 'Every feature of the product.', cite: { anchor: 'product', title: 'Product summary' } }).match(/<p\b[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
		const at = places(lead);
		expect(at.comments).toBeGreaterThan(lead.indexOf('Every feature of the product.'));
		expect(at.sources).toBeGreaterThan(at.comments);
		expect(lead).toContain('2 sources');
		expect(lead).not.toContain('data-evo-validate');
	});

	it('adds its cross and its check after the links where the head is the element itself, and its thread at its foot', () => {
		const html = head({ lead: 'Who can do what.', cite: { anchor: 'product', title: 'Permissions', validates: true, foot: true } });
		const lead = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
		expect(lead.indexOf('data-evo-validate')).toBeGreaterThan(lead.indexOf('title="Open the comments"'));
		expect(html.slice(html.indexOf('</p>'))).toContain(`id="${anchorDomId('product')}"`);
	});
});

describe('what a head is about closes its text with its comments and its sources, its cross and its check right after them [criterion:14a1164c] [criterion:a4ef7658]', () => {
	it('reads the text, the comments, the sources, then the cross and the check, in that order', () => {
		cited['feature:refunds'] = ['a.md', 'b.md', 'c.md'];
		const html = headText();
		const at = places(html);
		expect(html.indexOf('Return a payment.')).toBeLessThan(at.comments);
		expect(at.comments).toBeLessThan(at.sources);
		expect(at.sources).toBeLessThan(at.cross);
		expect(at.cross).toBeLessThan(at.check);
		expect(html).toContain('3 sources');
		// The links say it once: the controls draw no comments icon and no book of their own.
		expect(html).not.toContain('aria-label="Comments"');
		expect(html).not.toContain('aria-label="3 sources"');
	});

	it('leaves the sources link out when the element cites nothing', () => {
		expect(places(headText()).sources).toBe(-1);
	});

	it('gives the links up in the Edit mode, where the controls draw their own icons after the field', () => {
		mode.active = true;
		cited['feature:refunds'] = ['a.md', 'b.md', 'c.md'];
		const html = headText();
		expect(html).not.toContain('title="Open the comments"');
		expect(html).toContain('aria-label="Comments"');
		expect(html).toContain('aria-label="3 sources"');
	});

	it('puts the cross before the check on every element', () => {
		const at = places(clean(render(SpecControls, { props: { anchor: 'feature:refunds', title: 'Refunds' } }).body));
		expect(at.cross).toBeGreaterThan(-1);
		expect(at.cross).toBeLessThan(at.check);
	});

	it("closes a feature's own head that way, under the link to its core feature", () => {
		const html = clean(render(FeaturePage, { props: { data: {
			projectId: 'p', page: { kind: 'feature', feature: { id: 'refunds', coreId: 'billing', coreName: 'Billing', name: 'Refunds', description: 'Return a payment.', actions: [] } },
			actionData: {}, sourcedScreens: 0, findings: [], tables: [], usedFields: []
		} } as never }).body);
		expect(html).toMatch(/<a href="\/projects\/p\/spec\/features\/billing"[^>]*>Billing<\/a> ·\s*Feature/);
		const text = html.slice(html.indexOf('data-head-text'));
		const at = places(text);
		expect(text.indexOf('Return a payment.')).toBeLessThan(at.comments);
		expect(at.comments).toBeLessThan(at.cross);
		expect(at.cross).toBeLessThan(at.check);
	});
});
