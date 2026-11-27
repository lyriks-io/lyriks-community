import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { anchorDomId, anchorOf } from '$domain/discussions';
import { applyRetrospecActs, emptyRetrospecDocument, type RetrospecAct, type RetrospecDocument, type SpecElement } from '$domain/retrospec';
import { pushToast } from '$ui/design-system';
import { SpecValidation, type ValidationSource } from '$ui/spec360/validation.svelte';
import FeaturesPage from '../../../../routes/projects/[projectId]/spec/features/+page.svelte';
import CoreFeaturePage from './CoreFeaturePage.svelte';
import ActionList from './ActionList.svelte';
import type { ActionRule } from '$application/spec360/features';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), invalidateAll: vi.fn(), beforeNavigate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: routePage }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => cited.count > 0 ? { countOf: () => cited.count, openAnchor: null } : null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', () => ({ getRuleVerdicts: () => null }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const bob = { id: 'bob@example.test', name: 'Bob Li' };
const cleo = { id: 'cleo@example.test', name: 'Cleo Roy' };
const core = { id: 'billing', name: 'Billing', description: 'Collect payments.', features: [{ id: 'refunds', name: 'Refunds', description: 'Return a payment.', actionCount: 1 }] };
const anchors = [anchorOf('core', core.id), anchorOf('feature', 'refunds'), anchorOf('action', 'refunds', 'refund')];
const elements: SpecElement[] = anchors.map((id, i) => ({ id, title: ['Billing', 'Refunds', 'Refund a payment'][i] }));
const mode = { active: false, available: true };
const cited = { count: 0 };
const routePage = vi.hoisted(() => ({ url: new URL('http://localhost/projects/p/spec/features/refunds'), state: {} }));
const edits = {
	editing: null,
	shown: (_anchor: string, read: object) => read,
	current: (_anchor: string, read: object) => read,
	changed: () => false,
	shape: () => ({ desc: true }),
	added: () => [],
	gone: () => false,
	naming: () => false,
	notEditing: (ids: string[]) => ids
};
let source: ValidationSource;
let validation: SpecValidation;

function apply(doc: RetrospecDocument, acts: RetrospecAct[], actor = ana): RetrospecDocument {
	const result = applyRetrospecActs(doc, acts, { actor, now: '2026-11-13T01:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
const approve = (doc: RetrospecDocument, itemId: string, actor = ana) => apply(doc, [{ op: 'validate', itemId, title: itemId, tab: 'spec360' }], actor);

function reset(overrides: Partial<ValidationSource> = {}) {
	source = {
		projectId: 'p', me: bob, canWrite: true, doc: approve(emptyRetrospecDocument(), 'outside'), elements,
		team: [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['business', 'qa'] }, { person: cleo, jobIds: [] }], baselines: [], ...overrides
	};
	validation = new SpecValidation(() => source);
}

const clean = (html: string) => html.replace(/<!--.*?-->/g, '');
const rootList = () => clean(render(FeaturesPage, { props: { data: { projectId: 'p', spec: { productName: 'Ledger' }, list: { cores: [core], productRules: [] } } } as never }).body);
const featureList = () => clean(render(CoreFeaturePage, { props: { core, base: '/projects/p/spec' } }).body);
const actionList = (description = '', rules: readonly ActionRule[] = []) => clean(render(ActionList, { props: { featureId: 'refunds', actions: [{ id: 'refund', name: 'Refund a payment', description, who: [], rulesCount: `${rules.length} rules`, refusalLead: null, rules }], actionData: {} } }).body);
function row(html: string, anchor: string): string {
	const match = html.match(new RegExp(`<li id="${anchorDomId(anchor)}"[^>]*>([\\s\\S]*?)</li>`));
	expect(match, `Missing row ${anchor}`).not.toBeNull();
	return match![1];
}
const confirmedStamps = (html: string) => html.match(/data-stamp-ok="true"/g)?.length ?? 0;
const shownRow = (level: number) => level === 0 ? row(rootList(), anchors[0]) : level === 1 ? row(featureList(), anchors[1]) : actionList();

beforeEach(() => { mode.active = false; cited.count = 0; routePage.url = new URL('http://localhost/projects/p/spec/features/refunds'); reset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Features lists expose the same personal validation as their detail pages [criterion:74f14936]', () => {
	it('keeps core and feature navigation links separate from their approval buttons [criterion:89d4c960]', () => {
		for (const [html, anchor, href] of [
			[rootList(), anchors[0], '/projects/p/spec/features/billing'],
			[featureList(), anchors[1], '/projects/p/spec/features/refunds']
		]) {
			const item = row(html, anchor);
			const link = item.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
			expect(link).toContain(`href="${href}"`);
			expect(link).not.toContain('<button');
			expect(link).not.toContain('data-evo-validate');
			expect(item.indexOf('data-evo-validate')).toBeGreaterThan(item.indexOf('</a>'));
			expect(item).toContain('type="button"');
			expect(item).toContain('data-validation-state="validate"');
		}
	});

	it('retains canonical approval and stable anchors for actions in their existing list [scenario:3feb27fc]', () => {
		const html = actionList();
		expect(html).toContain(`id="${anchorDomId(anchors[2])}"`);
		expect(html).toContain('data-evo-validate');
		expect(html).toContain('data-validation-state="validate"');
	});

	it('offers an assigned readonly reviewer their own approval but no approval to an unassigned reader', () => {
		reset({ canWrite: false });
		expect(row(rootList(), anchors[0])).toContain('data-evo-validate');
		expect(row(featureList(), anchors[1])).toContain('data-evo-validate');
		expect(actionList()).toContain('data-evo-validate');
		reset({ canWrite: false, me: cleo });
		expect(row(rootList(), anchors[0])).not.toContain('data-evo-validate');
		expect(row(featureList(), anchors[1])).not.toContain('data-evo-validate');
		expect(actionList()).not.toContain('data-evo-validate');
	});

	it('honors an additional reviewer request only for the selected row', () => {
		const doc = apply(source.doc, [{ op: 'request_validation', itemId: anchors[0], title: 'Billing', to: cleo }]);
		reset({ doc, canWrite: false, me: cleo });
		expect(row(rootList(), anchors[0])).toContain('data-evo-validate');
		expect(row(featureList(), anchors[1])).not.toContain('data-evo-validate');
	});

	for (const [level, scenario] of [[0, '4bf1983b'], [1, '58173488'], [2, 'e7086656']] as const) {
		it(`holds confirmed stamps during saving and restores the available control after a refusal [unspa:90e38220:1b361bc2:${scenario}]`, async () => {
			const anchor = anchors[level];
			reset({ doc: approve(source.doc, anchor) });
			let release!: (response: Response) => void;
			const send = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
			vi.stubGlobal('fetch', send);
			const before = shownRow(level);
			const pending = validation.validate(anchor, false);
			expect(shownRow(level)).toContain('data-validation-state="saving"');
			expect(confirmedStamps(shownRow(level))).toBe(confirmedStamps(before));
			expect(shownRow(level)).not.toContain('data-evo-validate');
			await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
			release(Response.json({ message: 'The project permissions changed.' }, { status: 403 }));
			expect(await pending).toBe(false);
			expect(shownRow(level)).toContain('data-validation-state="validate"');
			expect(confirmedStamps(shownRow(level))).toBe(confirmedStamps(before));
			expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your validation was not saved. The project permissions changed.' }));
		});
	}

	it('submits only the selected core anchor and shares its confirmed result with the detailed page [criterion:3a64fcca] [criterion:4d8fb665] [unspa:90e38220:1b361bc2:a255a4fd]', async () => {
		reset({ doc: approve(source.doc, anchors[0]) });
		const send = vi.fn().mockImplementation(async () => {
			source = { ...source, doc: approve(source.doc, anchors[0], bob) };
			return Response.json({ ok: true });
		});
		vi.stubGlobal('fetch', send);
		expect(await validation.validate(anchors[0], false)).toBe(true);
		expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'validate', itemId: anchors[0] }] });
		expect(row(rootList(), anchors[0])).toContain('data-validation-state="validated"');
		expect(featureList()).toContain('data-validation-state="validated"');
		expect(validation.mine(anchors[1])).toBe(false);
		expect(validation.mine(anchors[2])).toBe(false);
	});

	for (const [level, actionId, scenario] of [[0, '3a2dcaf8', '89a6f33c'], [1, 'bbee7534', '7f3db95a'], [2, '3a0bc8fa', 'f495a4b8']] as const) {
		it(`withdraws only the reader own approval from a list control [unspa:90e38220:${actionId}:${scenario}]`, async () => {
			const anchor = anchors[level];
			reset({ doc: approve(source.doc, anchor, bob) });
			const send = vi.fn().mockResolvedValue(Response.json({ ok: true }));
			vi.stubGlobal('fetch', send);
			expect(shownRow(level)).toContain('You validated this element · click to withdraw');
			validation.control(anchor)!.run!();
			expect(validation.saving(anchor)).toBe(true);
			expect(validation.mine(anchor)).toBe(true);
			expect(shownRow(level)).toContain('data-validation-state="saving"');
			await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
			expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'withdraw', itemId: anchor }] });
		});
	}

	it('keeps approval unavailable when the project roster cannot be checked', () => {
		reset({ teamAvailable: false });
		expect(row(rootList(), anchors[0])).toMatch(/<button[^>]*data-evo-validate[^>]*disabled/);
		expect(validation.control(anchors[0])?.run).toBeNull();
		expect(row(rootList(), anchors[0])).toContain('The project team is unavailable. Try again when it is available.');
	});

	it('keeps editable fields separate from navigation and holds approval while editing [scenario:87e64436]', () => {
		mode.active = true;
		for (const [html, anchor] of [[rootList(), anchors[0]], [featureList(), anchors[1]]]) {
			const item = row(html, anchor);
			expect(item).toContain('aria-label="Name"');
			expect(item).toContain('aria-label="Description"');
			expect(item).toContain('aria-label="Open ');
			expect(item).not.toContain('data-evo-validate');
		}
		const actions = actionList();
		expect(actions).toContain('aria-label="Name"');
		expect(actions).toContain('contenteditable="plaintext-only"');
		expect(actions).not.toContain('data-evo-validate');
		expect(actions).not.toContain('data-reject-state');
		expect(actions).toContain('aria-label="Comments"');
	});

	it('closes the Features lead with the comments of the product and repeats no Validate all in its head: the band at the top of Knowledge holds it [criterion:d7cd4e43] [criterion:14a1164c]', () => {
		const html = rootList();
		const lead = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
		expect(lead).toContain('Everything Ledger does');
		expect(lead).toContain('title="Open the comments"');
		expect(html).not.toContain('data-validate-all');
	});

	it('removes individual approval controls once the specification is definitive', () => {
		reset({ doc: apply(source.doc, [{ op: 'publish', baselineId: 'baseline-1', notify: [] }]) });
		expect(row(rootList(), anchors[0])).not.toContain('data-evo-validate');
		expect(row(featureList(), anchors[1])).not.toContain('data-evo-validate');
		expect(actionList()).not.toContain('data-evo-validate');
	});
});

describe('action rows read their description before citations [criterion:b0c7f0c8]', () => {
	it('shows the stored description once below the name, closed by its comments and sources on its last line [criterion:57ee9b9b]', () => {
		cited.count = 2;
		const description = 'Return the captured payment to its original payer.';
		const html = actionList(description);
		expect(html.split(description)).toHaveLength(2);
		expect(html.indexOf('Refund a payment')).toBeLessThan(html.indexOf(description));
		expect(html.indexOf(description)).toBeLessThan(html.indexOf('class="cite-links'));
		// Inside the description's paragraph, right after its last word (owner review 2026-11-14).
		expect(html.slice(html.indexOf(description), html.indexOf('class="cite-links'))).not.toContain('</p>');
		expect(html).toContain('Open the comments');
		expect(html).toContain('2 sources');
		expect(html).not.toContain('aria-label="Comments"');
		expect(html).not.toContain('aria-label="2 sources"');
		expect(html).not.toContain('Who may do it');
		for (const button of html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)) expect(button[0].match(/<button\b/g)).toHaveLength(1);
	});

	it('keeps exactly one description field when Details is held open in the Edit mode [criterion:119af301]', () => {
		mode.active = true;
		const html = actionList('A description being edited.');
		expect(html.match(/aria-label="What it is for"/g)).toHaveLength(1);
		expect(html).toContain('Who may do it');
		expect(html).toContain('Nobody is granted it yet');
		expect(html).not.toContain('data-evo-validate');
		expect(html).toContain('aria-label="Comments"');
	});

	it('uses the existing empty-description text once in the row', () => {
		const html = actionList();
		expect(html.split('The behavior model does not say what this action is for yet.')).toHaveLength(2);
	});
});

describe('the action comes before its rules [criterion:54bd4e66]', () => {
	const rule: ActionRule = { id: 'guard', text: 'The system shall require a captured payment.', kind: 'rule', category: 'business', blocks: false };
	const shown = () => actionList('Return the payment.', [rule]);
	const visible = () => shown().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
	it('stays folded with Show rules available, even once the reader approved the action', () => {
		expect(shown()).toContain('Show rules (1)');
		expect(visible()).not.toContain(rule.text);
		reset({ doc: approve(source.doc, anchors[2], bob) });
		expect(visible()).not.toContain(rule.text);
		expect(shown()).toContain('Show rules (1)');
	});
	it('does not mistake a pending or refused approval for a confirmed one', async () => {
		let release!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => release = resolve)));
		const pending = validation.validate(anchors[2], false);
		expect(visible()).not.toContain(rule.text);
		await vi.waitFor(() => expect(release).toBeDefined());
		release(Response.json({ message: 'The permissions changed.' }, { status: 403 }));
		expect(await pending).toBe(false);
		expect(visible()).not.toContain(rule.text);
	});
	it('opens a direct rule link before personal approval', () => {
		routePage.url.hash = anchorDomId(anchorOf('rule', 'refunds', 'guard'));
		expect(visible()).toContain(rule.text);
	});
	it('opens rules and exposes edit/add controls in Edit mode, retaining read-only invariants', () => {
		mode.active = true;
		expect(visible()).toContain(rule.text);
		expect(shown()).toContain('Edit rule');
		expect(shown()).toContain('Add a rule');
		const invariant = actionList('', [{ ...rule, kind: 'invariant' }]);
		expect(invariant).not.toContain('>Edit rule<');
	});
});
