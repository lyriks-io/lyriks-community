import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { applyRetrospecActs, emptyRetrospecDocument, type RetrospecAct, type RetrospecDocument, type SpecElement } from '$domain/retrospec';
import { SpecValidation, type ValidationSource } from '$ui/spec360/validation.svelte';
import OwnValidation from './OwnValidation.svelte';
import OverviewPage from '../../../../routes/projects/[projectId]/spec/+page.svelte';
import FeaturePage from '../../../../routes/projects/[projectId]/spec/features/[featureId]/+page.svelte';

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
const bob = { id: 'bob@example.test', name: 'Bob Li' };
const cleo = { id: 'cleo@example.test', name: 'Cleo Roy' };
const anchors = ['product', 'problem', 'target', 'core:billing', 'role:customer'];
const elements: SpecElement[] = anchors.map((id) => ({ id, title: id, owner: 'product' }));
const mode = { active: false, available: true };
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, value: object) => value,
	current: (_anchor: string, value: object) => value,
	edited: () => false, gone: () => false, changed: () => false,
	shape: () => ({ text: true }), added: () => [], naming: () => false,
	notEditing: (ids: readonly string[]) => ids
};
let source: ValidationSource;
let validation: SpecValidation;

function apply(doc: RetrospecDocument, acts: RetrospecAct[], actor = ana): RetrospecDocument {
	const result = applyRetrospecActs(doc, acts, { actor, now: '2026-11-13T02:00:00.000Z' });
	if (!result.ok) throw new Error(result.reason);
	return result.doc;
}
const approve = (doc: RetrospecDocument, id: string, actor = ana) => apply(doc, [{ op: 'validate', itemId: id, title: id, tab: 'spec360' }], actor);
const started = () => approve(emptyRetrospecDocument(), 'outside');
function reset(overrides: Partial<ValidationSource> = {}) {
	source = { projectId: 'p', me: bob, canWrite: true, doc: started(), elements,
		team: [{ person: ana, jobIds: ['product'] }, { person: bob, jobIds: ['product', 'design'] }], baselines: [], ...overrides };
	validation = new SpecValidation(() => source);
}
const clean = (html: string) => html.replace(/<!--.*?-->/g, '');
const own = (anchor: string) => clean(render(OwnValidation, { props: { anchor, title: anchor } }).body);
const overview = () => clean(render(OverviewPage, { props: { data: {
	projectId: 'p', canWrite: source.canWrite, spec: { productName: 'Ledger' }, reach: { customer: 1 },
	glance: { brief: 'A ledger.', pitch: 'A ledger.', classification: null, meta: [], problem: 'Slow refunds.', symptoms: [], target: 'Fast refunds.', outcomes: [],
		users: [{ id: 'customer', name: 'Customer', description: '', userClass: 'end' }],
		cores: [{ id: 'billing', name: 'Billing', description: 'Collect payments.', features: 1 }], health: null, healthReading: false },
	noticed: { waitsForFeature: false, total: 0, pending: 0, major: 0, minor: 0, settled: 0, types: [] }
} } as never }).body);

beforeEach(() => { mode.active = false; edits.editing = null; reset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Overview blocks validate one by one beside their frames [criterion:e20318e7] [criterion:f2eabcd9] [criterion:00d0d300]', () => {
	it('keeps product, problem, target, core and profile checks after every frame has been approved', () => {
		const doc = anchors.reduce((doc, id) => approve(approve(doc, id), id, bob), started());
		reset({ doc });
		const html = overview();
		expect(html).not.toContain('data-validate-all');
		expect(html.match(/data-evo-validate/g)).toHaveLength(5);
		// The standard review control on every block: the reviewer picker names each one.
		for (const name of ['Problems', 'Objectives', 'Billing', 'Customer']) expect(html).toContain(`aria-label="Request validation: ${name}"`);
		expect(html).toContain('You validated this element · click to withdraw');
		for (const link of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []) expect(link).not.toContain('data-evo-validate');
	});

	it('offers fresh approval on every block and on its frame', () => {
		expect(overview()).toContain('data-validate-all');
		for (const id of anchors) expect(own(id)).toContain('data-evo-validate');
	});

	it('shows the frame Validate the whole section without editing rights to whom the blocks wait on [criterion:43bef20d]', () => {
		reset({ canWrite: false });
		expect(overview()).toContain('data-validate-all');
	});

	it('keeps an assigned readonly reviewer own check while other reviewers are awaited', () => {
		reset({ doc: approve(source.doc, 'target', bob), canWrite: false });
		expect(own('target')).toContain('data-evo-validate');
		expect(own('target')).toContain('data-validation-state="waiting"');
	});

	it('withdraws only the selected reviewer approval and leaves the other reviewer intact', async () => {
		reset({ doc: approve(approve(source.doc, 'problem'), 'problem', bob) });
		const send = vi.fn().mockImplementation(async () => {
			source = { ...source, doc: apply(source.doc, [{ op: 'withdraw', itemId: 'problem' }], bob) };
			return Response.json({ ok: true });
		});
		vi.stubGlobal('fetch', send);
		expect(await validation.withdraw('problem')).toBe(true);
		expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'withdraw', itemId: 'problem' }] });
		// Withdrawn, the block offers the reader's fresh validation again.
		expect(validation.mine('problem')).toBe(false);
		expect(own('problem')).toContain('data-evo-validate');
		expect(validation.standing('problem')?.validatedBy).toEqual([ana]);
	});

	it('preserves the confirmed check while withdrawal is pending and restores it after refusal', async () => {
		reset({ doc: approve(source.doc, 'core:billing', bob) });
		let release!: (response: Response) => void;
		const send = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
		vi.stubGlobal('fetch', send);
		const pending = validation.withdraw('core:billing');
		expect(own('core:billing')).toContain('data-validation-state="saving"');
		expect(validation.mine('core:billing')).toBe(true);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		release(Response.json({ message: 'Permissions changed.' }, { status: 403 }));
		expect(await pending).toBe(false);
		expect(own('core:billing')).toContain('data-evo-validate');
		expect(validation.mine('core:billing')).toBe(true);
	});

	it('keeps a confirmed check available after an interrupted withdrawal', async () => {
		reset({ doc: approve(source.doc, 'role:customer', bob) });
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Disconnected')));
		expect(await validation.withdraw('role:customer')).toBe(false);
		expect(own('role:customer')).toContain('data-evo-validate');
	});

	it('honors current assignments and unavailable rosters when showing the own check', () => {
		reset({ doc: approve(source.doc, 'problem', bob), canWrite: false, team: [] });
		expect(validation.control('problem')?.run).toBeNull();
		expect(own('problem')).not.toContain('data-evo-validate');
		reset({ doc: approve(source.doc, 'problem', bob), teamAvailable: false });
		expect(own('problem')).not.toContain('data-evo-validate');
	});

	it('removes the check after definitive validation', () => {
		reset({ doc: approve(source.doc, 'problem', bob) });
		expect(own('problem')).toContain('data-evo-validate');
		reset({ doc: apply(source.doc, [{ op: 'publish', baselineId: 'b', notify: [] }]) });
		expect(own('problem')).not.toContain('data-evo-validate');
	});
});

it('puts the reader first among the people of an element, never in +N [criterion:8d6c8ec0]', () => {
	reset({ me: bob, team: [{ person: ana, jobIds: ['product'] }, { person: cleo, jobIds: ['product'] }, { person: { id: 'dan@example.test', name: 'Dan Ko' }, jobIds: ['product'] }, { person: bob, jobIds: ['product'] }] });
	const stamps = validation.control('problem')!.stamps;
	expect(stamps[0]).toMatchObject({ id: bob.id, initials: 'YOU', me: true });
	expect(stamps[0].title).toMatch(/^You · /);
	// A click on initials is confirmed first: validate one's own, remind someone else's.
	expect(stamps[0].confirm).toEqual({ question: 'Validate problem?', act: 'Validate' });
	expect(stamps.find((x) => x.id === ana.id)?.confirm).toEqual({ question: 'Send a reminder to Ana Diaz?', act: 'Send' });
});

it('names the separate action-journey review and keeps its own target [criterion:3f89290d]', async () => {
	const flow = 'flow:refunds';
	reset({ elements: [{ id: flow, title: 'Actions · Refunds', owner: 'design' }, { id: 'action:refunds:refund', title: 'Refund', owner: 'product' }] });
	const html = clean(render(FeaturePage, { props: { data: {
		projectId: 'p', page: { kind: 'feature', feature: { id: 'refunds', coreId: 'billing', coreName: 'Billing', name: 'Refunds', description: '',
			actions: [{ id: 'refund', name: 'Refund', description: '', who: [], rulesCount: '0 rules', refusalLead: null, rules: [] }] } },
		actionData: {}, sourcedScreens: 0, findings: [], tables: [], usedFields: []
	} } as never }).body);
	expect(html).toContain('aria-label="Review action journey"');
	expect(html).toContain('>Action journey</span>');
	const send = vi.fn().mockResolvedValue(Response.json({ ok: true }));
	vi.stubGlobal('fetch', send);
	expect(await validation.validate(flow, false)).toBe(true);
	expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ acts: [{ op: 'validate', itemId: flow }] });
	expect(validation.mine('action:refunds:refund')).toBe(false);
});
