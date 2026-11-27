import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { anchorOf } from '$domain/discussions';
import { applyRetrospecActs, emptyRetrospecDocument, type SpecElement } from '$domain/retrospec';
import type { ActionRule } from '$application/spec360/features';
import type { ActionData } from '$application/spec360/action-data';
import type { RuleVerdict } from '$application/analysis/rule-verdicts';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import { RuleVerdictsStore } from '$ui/rules/rule-verdicts.svelte';
import ActionList from './ActionList.svelte';
import ActionDataBlock from './ActionDataBlock.svelte';
import RuleLine from './RuleLine.svelte';

/**
 * A feature's actions as one list (criteria 50809f1c, d0e0e1a5) and its rules read inline (criteria 7d1e80b6,
 * be4c97ee), rendered with the real validation. How a row's approval and its rules' folding behave is
 * list-validation's.
 */

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/projects/p/spec/features/refunds'), state: {} } }));
vi.mock('$ui/design-system', async (original) => ({ ...await original<object>(), pushToast: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => mode }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => edits }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => ({ tally: () => ({ open: 0, total: 0 }), openAnchor: null }) }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => null }));
vi.mock('$ui/spec360/spec-news.svelte', () => ({ useSpecNews: () => ({ badgeOf: () => null }) }));
vi.mock('$ui/ai-session/project-ai-session.svelte', () => ({ useProjectAiSession: () => null }));
vi.mock('$ui/rules/rule-verdicts.svelte', async (original) => ({ ...await original<object>(), getRuleVerdicts: () => verdicts }));

const ana = { id: 'ana@example.test', name: 'Ana Diaz' };
const mode = { active: false, available: true };
// The real store of what the solver says, filled as the server would answer for the feature.
let verdicts: RuleVerdictsStore;
const proved = (verdict: RuleVerdict) => verdicts.features.set('refunds', { featureId: 'refunds', solver: 'ran', scope: null, rules: { guard: verdict }, actions: {}, flaws: verdict.flaw ? 1 : 0 });
const edits = {
	editing: null as string | null,
	shown: (_anchor: string, read: object) => read,
	current: (_anchor: string, read: object) => read,
	changed: () => false, shape: () => ({ desc: true }), added: () => [], gone: () => false, naming: () => false,
	notEditing: (ids: string[]) => ids
};
const rule: ActionRule = { id: 'guard', text: 'When the payment is captured, the system shall refund it.', kind: 'rule', category: 'business', blocks: false };
const action = (id: string, name: string) => ({ id, name, description: `What ${name} is for.`, who: [], rulesCount: '1 rule', refusalLead: null, rules: [rule] });
const actions = [action('refund', 'Refund a payment'), action('void', 'Void a payment')];
const elements: SpecElement[] = actions.map((a) => ({ id: anchorOf('action', 'refunds', a.id), title: a.name }));
let validation: SpecValidation;

const clean = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/ class="svelte-[a-z0-9]+"/g, '').replace(/ svelte-[a-z0-9]+/g, '');
const list = (actionData: Record<string, ActionData> = {}) => clean(render(ActionList, { props: { featureId: 'refunds', actions, actionData } }).body);
const details = (html: string) => html.match(/<button[^>]*data-row-open[^>]*aria-expanded="(true|false)"/g)?.map((b) => b.endsWith('"true"')) ?? [];

beforeEach(() => {
	mode.active = false;
	verdicts = new RuleVerdictsStore('p');
	const started = applyRetrospecActs(emptyRetrospecDocument(), [{ op: 'validate', itemId: 'outside', title: 'outside', tab: 'spec360' }], { actor: ana, now: '2026-11-18T02:00:00.000Z' });
	if (!started.ok) throw new Error(started.reason);
	validation = new SpecValidation(() => ({ projectId: 'p', me: ana, canWrite: true, doc: started.doc, elements, team: [{ person: ana, jobIds: ['product'] }], baselines: [] }));
});

describe("a feature's actions read as one list [criterion:50809f1c]", () => {
	it('keeps one row per action, in order, each with its Details folded and its check', () => {
		const html = list();
		expect(html.indexOf('Refund a payment')).toBeLessThan(html.indexOf('Void a payment'));
		expect(details(html)).toEqual([false, false]);
		expect(html.match(/data-evo-validate/g)).toHaveLength(2);
		expect(html).not.toContain('Who may do it');
	});

	it('holds every action open in the Edit mode, what it is for being a field [criterion:d0e0e1a5]', () => {
		mode.active = true;
		const html = list();
		expect(details(html)).toEqual([true, true]);
		expect(html.match(/Who may do it/g)).toHaveLength(2);
	});
});

describe('Details says what an action touches in the data model, and names apart what no field carries [criterion:d0e0e1a5]', () => {
	const block = (data: ActionData) => clean(render(ActionDataBlock, { props: { data } }).body);

	it('reads each table with what the action writes and reads', () => {
		const html = block({ tables: [{ tableId: 't1', table: 'Payment', writes: ['status'], reads: ['amount', 'currency'], records: null }], untracked: [] });
		expect(html).toContain('Payment');
		expect(html).toMatch(/Writes<\/span><span[^>]*>status</);
		expect(html).toMatch(/Reads<\/span><span[^>]*>amount, currency</);
		expect(html).not.toContain('Not in the data model');
	});

	it('names the states no field carries, and says so when nothing is tracked', () => {
		const html = block({ tables: [], untracked: ['refund window'] });
		expect(html).toContain('Not in the data model: refund window');
		expect(html).toContain('None of the states this action uses carries a field of the data model yet.');
		expect(block({ tables: [], untracked: [] })).toContain('This action reads and writes nothing.');
	});
});

describe('every rule reads inline under its action, its EARS keywords standing out [criterion:7d1e80b6] [criterion:be4c97ee]', () => {
	const line = () => clean(render(RuleLine, { props: { rule, featureId: 'refunds', actionId: 'refund', text: rule.text } }).body);

	it('sets the EARS keywords of its sentence apart', () => {
		const html = line();
		expect(html).toMatch(/<strong[^>]*>When<\/strong>/);
		expect(html).toMatch(/<strong[^>]*>shall<\/strong>/);
		expect(html).not.toMatch(/<strong[^>]*>payment<\/strong>/);
	});

	it('reads a flaw the solver found in full under the line, with what to do about it', () => {
		proved({ kind: 'dead', label: 'Never fires', tone: 'danger', flaw: true, detail: 'Given no captured payment, the rule never applies.', fix: 'Drop the condition or capture first.' });
		const html = line();
		expect(html).toContain('<p class="m-0">Given no captured payment, the rule never applies.</p>');
		expect(html).toContain('Drop the condition or capture first.');
	});

	it('keeps a verdict that found nothing wrong to its seal', () => {
		proved({ kind: 'no-flaw', label: 'No flaw found', tone: 'success', flaw: false, detail: 'Every path reaches it.' });
		expect(line()).not.toContain('Every path reaches it.</p>');
	});
});
