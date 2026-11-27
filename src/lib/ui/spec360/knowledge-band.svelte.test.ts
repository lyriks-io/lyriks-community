import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument, type PersonRef, type RetrospecAct, type RetrospecDocument, type SpecElement } from '$domain/retrospec';
import { SpecValidation, type ValidationSource } from './validation.svelte';
import { PageScopeSlot, type PageScope } from './page-scope.svelte';
import { pageAsk, standingTip } from './page-validation';
import KnowledgeBar from './KnowledgeBar.svelte';
import FeatureValidation from './FeatureValidation.svelte';
import SectionValidateAll from './SectionValidateAll.svelte';
import RejectAct from './RejectAct.svelte';
import type { SectionElements } from '$ui/evolution/section-elements';

/**
 * The top of Knowledge (criterion 8e942b12 of feat-feedback-docs) and the page's validation merged into its band
 * (criterion f480783f), rendered with the real validation of the specification: the band reads what the page asks of
 * the reader from the same board the server applies.
 */

const route = vi.hoisted(() => ({ path: '/projects/p/spec' }));
vi.mock('$app/state', () => ({
	page: { get url() { return new URL(`http://localhost${route.path}`); } },
	navigating: { to: null }
}));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('./validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('./edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('./edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('./page-scope.svelte', async (original) => ({ ...await original<object>(), usePageScope: () => slot }));
vi.mock('./discussions.svelte', () => ({ useDiscussions: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const bob = { id: 'bob@example.test', name: 'Bob Li' };
const cleo = { id: 'cleo@example.test', name: 'Cleo Roy' };
// Two profiles on Users, a core feature and its feature on Features, the product on the Overview.
const elements: SpecElement[] = [
	{ id: 'product', title: 'Product summary' },
	{ id: 'role:customer', title: 'Customer' },
	{ id: 'role:clerk', title: 'Clerk' },
	{ id: 'core:billing', title: 'Billing' },
	{ id: 'feature:refunds', title: 'Refunds' }
];
const mode = { active: false, available: true, set: (on: boolean) => void (mode.active = on) };
const edits = {
	editing: null as string | null,
	stagedCount: 0,
	notEditing: (ids: readonly string[]) => ids.filter((id) => id !== edits.editing)
};
let slot: PageScopeSlot | null;
let source: ValidationSource;
let validation: SpecValidation;

function apply(doc: RetrospecDocument, acts: RetrospecAct[], actor: PersonRef = ana): RetrospecDocument {
	const result = applyRetrospecActs(doc, acts, { actor, now: '2026-11-18T02:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
const approve = (doc: RetrospecDocument, id: string, actor: PersonRef = ana) => apply(doc, [{ op: 'validate', itemId: id, title: id, tab: 'spec360' }], actor);
function reset(overrides: Partial<ValidationSource> = {}) {
	source = {
		projectId: 'p', me: bob, canWrite: true, doc: approve(emptyRetrospecDocument(), 'outside'), elements,
		team: [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['product'] }], baselines: [], ...overrides
	};
	validation = new SpecValidation(() => source);
}

// The markup as read, without the hydration marks and the scoping classes of the components' styles.
const clean = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
function bar(path: string, checks: readonly string[] | null = null) {
	route.path = path;
	return clean(render(KnowledgeBar, { props: { projectId: 'p', productName: 'Ledger', standing: null, checks } }).body);
}
/** The band of where the specification stands, the third row. */
const band = (html: string) => html.slice(html.indexOf('data-page-validation') >= 0 ? html.lastIndexOf('<div', html.indexOf('data-page-validation')) : html.indexOf('</nav>'));
const validateTheWholeSection = /<button[^>]*title="([^"]*)"[^>]*>Validate the whole section<\/button>/;

beforeEach(() => {
	mode.active = false;
	edits.editing = null;
	slot = new PageScopeSlot();
	reset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

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
	it("gives the band its scope, and takes it back when it goes, never the next page's", () => {
		const held = new PageScopeSlot();
		const first = { anchors: ['product'], sectionId: 'kb-glance', label: 'validation of this page' };
		const next = { anchors: ['feature:f1'], sectionId: 'kb-feature-f1', label: 'validation of this feature' };
		const release = held.hold(first);
		expect(held.scope).toBe(first);
		const releaseNext = held.hold(next);
		release();
		expect(held.scope).toBe(next);
		releaseNext();
		expect(held.scope).toBeNull();
	});

	it('draws nothing of its own where a page declares what it is validated on', () => {
		route.path = '/projects/p/spec';
		expect(clean(render(FeatureValidation, { props: { anchors: ['product'], sectionId: 'kb-glance' } }).body)).toBe('');
	});
});

describe("the band reads the page's validation, never the whole specification's [criterion:f480783f]", () => {
	it('says how many elements of the page wait for the reader, then its gauge and count', () => {
		const html = band(bar('/projects/p/spec/users'));
		expect(html).toContain('aria-label="validation of this page"');
		expect(html).toContain('<b>2</b> elements here wait for your validation');
		expect(html).toContain('0 / 2');
		expect(html).toContain('title="0 of 2 validated by everyone they wait on · 2 not validated yet"');
		expect(html.indexOf('Draft · to validate')).toBeLessThan(html.indexOf('data-ask'));
	});

	it('counts one profile alone on its own page', () => {
		expect(band(bar('/projects/p/spec/users/customer'))).toContain('0 / 1');
	});

	it('carries no count of the whole specification [criterion:d7cd4e43]', () => {
		const html = band(bar('/projects/p/spec/users'));
		expect(html).not.toContain(`/ ${elements.length}`);
		expect(html).not.toContain(`of ${elements.length} elements validated`);
	});

	it('offers Validate the whole section for what waits on the reader, with how many in its tooltip [criterion:d7cd4e43] [criterion:ac-leaf-2e64c72e-33e9-42a0-877d-51b24a7b3177]', () => {
		const html = band(bar('/projects/p/spec/users'));
		expect(html.match(validateTheWholeSection)?.[1]).toBe('Validate the 2 elements of this section still waiting on you');
		expect(html).not.toContain('Validate my');
		expect(html).not.toContain('Validate all');
	});

	it('offers it to every reviewer the page waits on, editing rights or not, and never to a reader nobody waits on [criterion:43bef20d]', () => {
		reset({ canWrite: false });
		expect(band(bar('/projects/p/spec/users'))).toMatch(validateTheWholeSection);
		reset({ me: cleo });
		const outsider = band(bar('/projects/p/spec/users'));
		expect(outsider).not.toMatch(validateTheWholeSection);
		expect(outsider).toContain('Nothing waits for you here: 2 still wait for others');
	});

	it('leaves the element being edited out of the one-click validation, on the band and on its section, until Cancel or Save [criterion:42cb9176] [criterion:9079b6e5] [criterion:e0174e3e] [criterion:ac-leaf-6ca67c34-19ed-4dea-8c02-3e23af54fd8c]', () => {
		const section = () => clean(render(SectionValidateAll, { props: { anchors: ['role:customer', 'role:clerk'], what: 'profiles', sectionId: 'kb-who' } }).body);
		edits.editing = 'role:clerk';
		expect(band(bar('/projects/p/spec/users')).match(validateTheWholeSection)?.[1]).toBe('Validate the 1 element of this section still waiting on you');
		expect(section()).toContain('aria-label="Validate the whole section: 1 profile still waiting on you"');
		// Cancel or Save closes the editor: the element is counted again.
		edits.editing = null;
		expect(band(bar('/projects/p/spec/users')).match(validateTheWholeSection)?.[1]).toBe('Validate the 2 elements of this section still waiting on you');
		expect(section()).toContain('aria-label="Validate the whole section: 2 profiles still waiting on you"');
	});

	it('validates the page in one batch, a requested change left to its own decision, then says how many it validated and moves on [criterion:9079b6e5]', async () => {
		const send = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal('fetch', send);
		reset({ doc: apply(source.doc, [{ op: 'reject', itemId: 'role:clerk', title: 'Clerk', tab: 'spec360' }]) });
		// The band counts only what waits on the reader, the rejected profile left out.
		expect(band(bar('/projects/p/spec/users')).match(validateTheWholeSection)?.[1]).toBe('Validate the 1 element of this section still waiting on you');
		expect(await validation.validateAll(['role:customer', 'role:clerk'], 'kb-users-list')).toBe(true);
		expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'validate', itemId: 'role:customer' }] });
		const { pushToast } = await import('$ui/design-system');
		await vi.waitFor(() => expect(pushToast).toHaveBeenCalledWith({ level: 'success', message: 'You validated 1 element' }));
	});

	it('moves its count the moment a validation is sent, before the server answers [criterion:c509fa9c]', async () => {
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
		void validation.validate('role:customer', false);
		const html = band(bar('/projects/p/spec/users'));
		expect(html).toContain('<b>1</b> element here waits for your validation');
		// Ana still has to validate it: it is half validated, not done.
		expect(html).toContain('0 / 2');
		expect(html).toContain('1 waiting for others');
	});

	it('reads green once everything on the page is validated', () => {
		const doc = ['role:customer', 'role:clerk'].reduce((d, id) => approve(approve(d, id), id, bob), source.doc);
		reset({ doc });
		const html = band(bar('/projects/p/spec/users'));
		expect(html).toContain('Everything here is validated');
		expect(html).toContain('2 / 2');
		expect(html).not.toMatch(validateTheWholeSection);
	});
});

describe('never reads the scope of the page being left, and says nothing of a page that hands its own until it shows [criterion:c509fa9c]', () => {
	const featureScope: PageScope = { anchors: ['feature:refunds'], sectionId: 'kb-feature-refunds', label: 'validation of this feature', path: '/projects/p/spec/features/refunds' };

	it('says nothing on the Overview while the feature page being left still holds the band', () => {
		slot!.hold(featureScope);
		const html = band(bar('/projects/p/spec'));
		expect(html).not.toContain('data-ask');
		expect(html).not.toContain('Validate the whole section');
		expect(html).not.toContain('elements validated. Review every element');
	});

	it("reads the feature's own scope once the feature page shows", () => {
		slot!.hold(featureScope);
		const html = band(bar('/projects/p/spec/features/refunds'));
		expect(html).toContain('aria-label="validation of this feature"');
		expect(html).toContain('<b>1</b> element here waits for your validation');
		expect(html).toContain('0 / 1');
	});

	it('counts a page that hands no scope of its own on what it shows, whatever the slot still holds', () => {
		slot!.hold(featureScope);
		expect(band(bar('/projects/p/spec/users'))).toContain('0 / 2');
	});
});

describe("Knowledge holds the product's name, its chapters and where it stands, in view while the page scrolls [criterion:8e942b12]", () => {
	it('stacks the name with DRAFT and Edit, then the tab bar, then the band, in that order [criterion:41514698]', () => {
		const html = bar('/projects/p/spec/users');
		const order = ['>Ledger<', '>Draft</span>', 'title="Edit this page (Ctrl+E)"', '<nav', 'data-page-validation'].map((s) => html.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it("says on DRAFT how far the specification's validation went", () => {
		expect(bar('/projects/p/spec/users')).toMatch(/title="Draft: 0 of 5 elements validated"[^>]*>Draft<\/span>/);
	});

	it('closes the name\'s row with the version line, which opens the Reverse page [criterion:2dbed801]', () => {
		const html = bar('/projects/p/spec/users');
		const row = html.slice(0, html.indexOf('<nav'));
		expect(row).toContain('<a href="/projects/p/retrospec" title="The Reverse-Specifications of the product">Reverse-Specifications</a>');
	});

	it("titles the Overview with the product's name, and leaves the title to the page anywhere else [criterion:416e4885]", () => {
		expect(bar('/projects/p/spec')).toMatch(/<h1[^>]*>Ledger<\/h1>/);
		expect(bar('/projects/p/spec/users')).not.toContain('<h1');
	});

	it('marks the tab of the page on screen, and checks a chapter the draft validated', () => {
		const html = bar('/projects/p/spec/users/customer', ['features']);
		expect(html).toMatch(/<a[^>]*href="\/projects\/p\/spec\/users"[^>]*aria-current="page"/);
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		const features = html.match(/<a[^>]*data-tab="features"[^>]*>[\s\S]*?<\/a>/)?.[0];
		expect(features).toContain('aria-label="Validated"');
		expect(html.match(/aria-label="Validated"/g)).toHaveLength(1);
	});

	it('reads VALIDATED with + New change once the specification is validated, and no DRAFT', () => {
		const doc = elements.reduce((d, e) => approve(approve(d, e.id), e.id, bob), source.doc);
		reset({ doc: apply(doc, [{ op: 'publish', baselineId: 'b1', notify: [] }]) });
		const html = bar('/projects/p/spec/users');
		expect(html).not.toContain('>Draft</span>');
		expect(html).toContain('>Validated</span>');
		expect(html).toContain('This specification is the reference. To change it, propose a change.');
		expect(html).toMatch(/<a[^>]*href="\/projects\/p\/evolution\?new"[^>]*>\+ New change<\/a>/);
		expect(html).not.toContain('data-ask');
	});

	it('offers Edit only to whom may edit', () => {
		mode.available = false;
		try {
			expect(bar('/projects/p/spec/users')).not.toContain('Edit this page');
		} finally {
			mode.available = true;
		}
	});
});

describe('the cross is gone for whoever validated the element [criterion:a4ef7658]', () => {
	const cross = (anchor: string) => clean(render(RejectAct, { props: { anchor, title: 'Customer' } }).body);

	it('offers the cross only to an editor who has not validated it', () => {
		expect(cross('role:customer')).toContain('aria-label="Request a change: Customer"');
		reset({ doc: approve(source.doc, 'role:customer', bob) });
		expect(cross('role:customer')).toBe('');
		reset({ canWrite: false });
		expect(cross('role:customer')).toBe('');
	});

	it('reads filled once a change was requested, with no button', () => {
		reset({ doc: apply(source.doc, [{ op: 'reject', itemId: 'role:customer', title: 'Customer', tab: 'spec360' }]) });
		const html = cross('role:customer');
		expect(html).toContain('data-reject-state="requested"');
		expect(html).not.toContain('<button');
	});
});

describe('Validate the whole section of a frame is the check of the four acts, with its count [criterion:aba60be7] [criterion:3f424411] [criterion:ac-leaf-2e64c72e-33e9-42a0-877d-51b24a7b3177]', () => {
	const section = (always = false, what: SectionElements = 'profiles') => clean(render(SectionValidateAll, { props: { anchors: ['role:customer', 'role:clerk'], what, sectionId: 'kb-who', always } }).body);

	it('draws the check with how many it validates beside it, its tooltip and accessible name Validate the whole section: N <elements> still waiting on you', () => {
		const html = section();
		expect(html).toMatch(/<button[^>]*title="Validate the whole section: 2 profiles still waiting on you"[^>]*aria-label="Validate the whole section: 2 profiles still waiting on you"[^>]*data-validate-all[^>]*>[\s\S]*<\/svg>2<\/button>/);
		expect(html).not.toContain('Validate all');
		// The rules the whole product keeps, on the Features page.
		expect(section(false, 'rules')).toContain('aria-label="Validate the whole section: 2 rules still waiting on you"');
	});

	it('names one element in the singular', () => {
		reset({ doc: approve(source.doc, 'role:clerk', bob) });
		expect(section()).toContain('aria-label="Validate the whole section: 1 profile still waiting on you"');
	});

	it('is gone once nothing of the section waits on the reader, keeping its height outside a frame', () => {
		reset({ doc: approve(approve(source.doc, 'role:clerk', bob), 'role:customer', bob) });
		expect(section()).not.toContain('data-validate-all');
		expect(section()).toContain('aria-hidden="true"');
		expect(section(true)).toBe('');
	});
});

describe('the band carries no Versions button [criterion:1eb35bd3]', () => {
	it('closes the version line with the version alone', () => {
		expect(bar('/projects/p/spec')).not.toContain('aria-label="Versions"');
	});
});
