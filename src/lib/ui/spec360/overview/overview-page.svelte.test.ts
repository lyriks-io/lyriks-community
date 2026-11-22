import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument, type SpecElement } from '$domain/retrospec';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import { commentsWords, sourcesWords } from '$ui/spec360/CiteLinks.svelte';
import OverviewPage from '../../../../routes/projects/[projectId]/spec/+page.svelte';

/**
 * The Overview as the real route renders it (criterion 416e4885), with the real validation of the specification:
 * About the product closed by its links and its acts, Why it exists in two cards, What it does, Who uses it.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', () => ({ getRuleVerdicts: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const elements: SpecElement[] = ['product', 'problem', 'target', 'core:billing', 'role:customer'].map((id) => ({ id, title: id, owner: 'product' }));
const mode = { active: false, available: true };
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, value: object) => value,
	current: (_anchor: string, value: object) => value,
	edited: () => false, gone: () => false, changed: () => false,
	shape: () => ({ text: true }), added: () => [], naming: () => false,
	notEditing: (ids: readonly string[]) => ids
};
const started = () => {
	const result = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
};
let validation: SpecValidation;

const LONG_NAME = 'Billing, invoicing, refunds and every reconciliation the finance team runs at the end of each month';
const LONG_DESC = 'Collect payments, send invoices, return a payment and reconcile what the bank says with what the ledger holds, account by account.';
interface Glance { symptoms?: string[]; outcomes?: { label: string; values: never[] }[]; meta?: { dimension: string; labels: string[] }[] }
const clean = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
const overview = (over: Glance = {}) => clean(render(OverviewPage, { props: { data: {
	projectId: 'p', canWrite: true, spec: { productName: 'Ledger' }, reach: { customer: 1 },
	glance: { brief: 'A ledger.\n\nFor small shops.', pitch: 'A ledger.', classification: null, meta: over.meta ?? [], problem: 'Slow refunds.', symptoms: over.symptoms ?? [],
		target: 'Fast refunds.', outcomes: over.outcomes ?? [],
		users: [{ id: 'customer', name: 'Customer', description: '', userClass: 'end' }],
		cores: [{ id: 'billing', name: LONG_NAME, description: LONG_DESC, features: 1 }], health: null, healthReading: false },
	noticed: { waitsForFeature: false, total: 0, pending: 0, major: 0, minor: 0, settled: 0, types: [], toConfirm: 0 }
} } as never }).body);
/** The part of the page between two markers. */
const between = (html: string, from: string, to?: string) => html.slice(html.indexOf(from), to ? html.indexOf(to, html.indexOf(from)) : undefined);
const frame = (html: string, id: string) => between(html, `id="${id}"`, id === 'kb-who' ? 'id="kb-noticed"' : undefined);

beforeEach(() => {
	mode.active = false;
	validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started(), elements, team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
});

describe('About the product closes its summary with its comments and sources as links of the text [criterion:416e4885]', () => {
	it('reads the comments as an invitation, then as how many topics are open, and the sources as how many', () => {
		expect(commentsWords(0)).toBe('Comment');
		expect(commentsWords(1)).toBe('1 comment');
		expect(commentsWords(2)).toBe('2 comments');
		expect(sourcesWords(1)).toBe('1 source');
		expect(sourcesWords(3)).toBe('3 sources');
	});

	it('puts the links after the last paragraph of the summary, its cross and its check right after them on the same line [criterion:a4ef7658]', () => {
		const about = between(overview(), 'About the product', 'The product in figures');
		const paragraphs = about.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
		expect(paragraphs).toHaveLength(2);
		expect(paragraphs[0]).not.toContain('Open the comments');
		const last = paragraphs[1];
		expect(last).toContain('For small shops.');
		const link = last.indexOf('title="Open the comments"');
		expect(link).toBeGreaterThan(last.indexOf('For small shops.'));
		expect(last.indexOf('data-evo-validate')).toBeGreaterThan(link);
		// Its controls once, there: never a second line of them under the chips outside the Edit mode.
		expect(about.match(/data-evo-validate/g)).toHaveLength(1);
	});

	it('gives the links up in the Edit mode, where the summary is a field and its controls take their own line', () => {
		mode.active = true;
		const about = between(overview(), 'About the product', 'The product in figures');
		expect(about).not.toContain('title="Open the comments"');
		expect(about).toContain('data-evo-validate');
		expect(about).toContain('aria-label="Comments"');
	});
});

describe("the Overview has no head of its own: its title is the product's name at the top of Knowledge [criterion:416e4885] [criterion:14a1164c]", () => {
	it('draws no title and offers no + New evolution', () => {
		const html = overview();
		expect(html).not.toContain('<h1');
		expect(html).not.toContain('New evolution');
	});
});

describe('the two cards of Why it exists say which is the problem and which the target [criterion:71338aeb] [criterion:e20318e7]', () => {
	it('opens the problem card on THE PROBLEM then its Symptoms, the target card on THE TARGET then its Results', () => {
		const why = frame(overview({ symptoms: ['Refunds take a week'], outcomes: [{ label: 'Refund within a day', values: [] }] }), 'kb-why');
		const problem = between(why, 'aria-label="The problem"', '</article>');
		const target = between(why, 'aria-label="The target"', '</article>');
		expect(problem.indexOf('>The problem</h3>')).toBeLessThan(problem.indexOf('>Symptoms<'));
		expect(problem.indexOf('>Symptoms<')).toBeLessThan(problem.indexOf('Refunds take a week'));
		expect(target.indexOf('>The target</h3>')).toBeLessThan(target.indexOf('>Results<'));
		expect(target.indexOf('>Results<')).toBeLessThan(target.indexOf('Refund within a day'));
	});

	it('says so while a draft leaves the symptoms and the results empty', () => {
		const why = frame(overview(), 'kb-why');
		expect(between(why, 'aria-label="The problem"', '</article>')).toContain('No symptom written yet.');
		expect(between(why, 'aria-label="The target"', '</article>')).toContain('No result written yet.');
	});

	it('closes each card with the standard review control, in its corner', () => {
		const why = frame(overview(), 'kb-why');
		for (const card of ['aria-label="The problem"', 'aria-label="The target"']) {
			const marks = between(between(why, card, '</article>'), 'data-card-marks');
			expect(marks).toContain('data-evo-validate');
			expect(marks).toContain('aria-label="Request validation:');
		}
	});
});

describe('every frame of the Overview offers its Validate the whole section at rest [criterion:e20318e7] [criterion:90232fe6] [criterion:3f424411]', () => {
	it('carries the check with its count on Why it exists, What it does and Who uses it [criterion:ac-leaf-2e64c72e-33e9-42a0-877d-51b24a7b3177]', () => {
		const html = overview();
		expect(frame(html, 'kb-why')).toMatch(/title="Validate the whole section: 2 elements still waiting on you"[^>]*aria-label="Validate the whole section: 2 elements still waiting on you"[^>]*data-validate-all[^>]*>[\s\S]*?<\/svg>2<\/button>/);
		expect(frame(html, 'kb-what')).toMatch(/aria-label="Validate the whole section: 1 core feature still waiting on you"[^>]*data-validate-all/);
		expect(frame(html, 'kb-who')).toMatch(/aria-label="Validate the whole section: 1 profile still waiting on you"[^>]*data-validate-all/);
	});

	it('carries the standard review control on each profile of Who uses it', () => {
		expect(frame(overview(), 'kb-who')).toContain('aria-label="Request validation: Customer"');
	});
});

describe("in the Edit mode each chip of the product's type says what it fills [criterion:3bb5b091]", () => {
	const meta = [{ dimension: 'Industry', labels: ['Retail'] }, { dimension: 'Form factors', labels: ['Web', 'Mobile'] }];

	it('names each chip in its tooltip outside the Edit mode, and no group', () => {
		const chips = between(overview({ meta }), 'data-chips');
		expect(chips).toContain('title="Industry: Retail"');
		expect(chips).toContain('title="Form factors: Mobile"');
		expect(chips).not.toContain('data-dimension');
	});

	it('names each group in the Edit mode', () => {
		mode.active = true;
		const chips = between(overview({ meta }), 'data-chips');
		expect([...chips.matchAll(/<span[^>]*data-dimension[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(['Industry', 'Form factors']);
	});
});

describe('a card cuts a long name or description, whole in its tooltip [criterion:f5fdaf55]', () => {
	it('keeps the whole name and the whole description of a core feature in their tooltips', () => {
		const what = frame(overview(), 'kb-what');
		expect(what).toMatch(new RegExp(`<a[^>]*data-row-open[^>]*title="${LONG_NAME}"`));
		expect(what).toContain(`title="${LONG_DESC}"`);
	});
});
