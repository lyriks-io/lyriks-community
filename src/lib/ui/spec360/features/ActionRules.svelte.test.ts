import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { anchorDomId, anchorOf } from '$domain/discussions';
import { emptyRetrospecDocument } from '$domain/retrospec';
import type { ActionRule, FeatureActionView } from '$application/spec360/features';
import { SpecValidation } from '$ui/spec360/validation.svelte';
import ActionRules from './ActionRules.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), goto: vi.fn() }));
vi.mock('$ui/spec360/validation.svelte', async (original) => ({ ...await original<object>(), useValidation: () => validation }));
vi.mock('$ui/spec360/edits.svelte', () => ({ useEdits: () => ({ editing: null, shape: () => null }) }));
vi.mock('$ui/spec360/edit-mode.svelte', () => ({ useEditMode: () => ({ active: false }) }));
vi.mock('$ui/spec360/discussions.svelte', () => ({ useDiscussions: () => discussions }));
vi.mock('$ui/spec360/sources.svelte', () => ({ useSources: () => sources }));
vi.mock('$ui/rules/rule-verdicts.svelte', () => ({ getRuleVerdicts: () => null }));

const featureId = 'refunds';
const me = { id: 'reviewer@example.test', name: 'Ana Diaz' };
const discussions = { openAnchor: null, tally: vi.fn(() => ({ open: 2, total: 2 })) };
const sources = { openAnchor: null, countOf: vi.fn(() => 1) };
let validation: SpecValidation;
const rule = (id: string, category?: string, extra: Partial<ActionRule> = {}): ActionRule => ({ id, category, kind: 'rule', blocks: false, text: `The system shall keep ${id}.`, ...extra });
const action = (rules: ActionRule[], refusalLead: string | null = null): FeatureActionView => ({ id: 'refund', name: 'Refund a payment', description: '', who: [], rulesCount: `${rules.length} rules`, refusalLead, rules });

function read(value: FeatureActionView) {
	validation = new SpecValidation(() => ({ projectId: 'p', me, canWrite: false, doc: emptyRetrospecDocument(), team: [{ person: me, jobIds: ['product'] }], baselines: [], elements: value.rules.map((r) => ({ id: anchorOf('rule', featureId, r.id), title: r.text })) }));
	return render(ActionRules, { props: { action: value, featureId } }).body.replace(/<!--.*?-->/g, '');
}
const textOf = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

beforeEach(() => vi.clearAllMocks());

describe('action rules read by their saved categories [criterion:ad995374]', () => {
	it('reads quiet Product, Technical and Other headings in that order without changing rule order within them [criterion:d9c7ce1a]', () => {
		const rules = [rule('tech-first', 'data'), rule('product-first', 'business'), rule('other', 'audit'), rule('product-second', 'permissions'), rule('tech-second', 'security')];
		const html = read(action(rules));
		expect([...html.matchAll(/<h4[^>]*>([^<]+)</g)].map((match) => match[1])).toEqual(['Product rules', 'Technical rules', 'Other rules']);
		const at = (id: string) => html.indexOf(`id="${anchorDomId(anchorOf('rule', featureId, id))}"`);
		expect(at('product-first')).toBeLessThan(at('product-second'));
		expect(at('product-second')).toBeLessThan(at('tech-first'));
		expect(at('tech-first')).toBeLessThan(at('tech-second'));
		expect(at('tech-second')).toBeLessThan(at('other'));
		expect(html).toContain('Grouped by saved category, without interpreting the rule’s text.');
	});

	it('keeps the whole EARS sentence when no same-group refusal run shares it [criterion:7dc9e813]', () => {
		const rules = [
			rule('limit', 'business', { text: 'When the reader refunds a payment, if the amount exceeds the payment, then the system shall refuse and show "Too much".' }),
			rule('outage', 'error_handling', { text: 'If the connection fails, then the system shall show "Try again".' })
		];
		const before = JSON.stringify(rules);
		const text = textOf(read(action(rules)));
		for (const r of rules) expect(text).toContain(r.text);
		expect(JSON.stringify(rules)).toBe(before);
	});

	it('keeps the same rule anchors, validation controls, comments and sources [criterion:821ec8f9]', () => {
		const rules = [rule('technical', 'validation'), rule('product', 'billing_quota'), rule('neutral')];
		const html = read(action(rules));
		for (const r of rules) {
			const anchor = anchorOf('rule', featureId, r.id);
			expect(html.split(`id="${anchorDomId(anchor)}"`)).toHaveLength(2);
			expect(discussions.tally).toHaveBeenCalledWith(anchor);
			expect(sources.countOf).toHaveBeenCalledWith(anchor);
			expect(validation.element(anchor)?.title).toBe(r.text);
		}
		expect(html.match(/data-evo-validate/g)).toHaveLength(rules.length);
		expect(html.match(/aria-label="Comments"/g)).toHaveLength(rules.length);
		expect(html.match(/aria-label="1 source"/g)).toHaveLength(rules.length);
	});

	it('retains a shared refusal sentence only within its consecutive category run [criterion:d9c7ce1a]', () => {
		const lead = 'When the reader refunds a payment, the system shall refuse if any of these holds:';
		const rules = [
			rule('first', 'business', { refusal: { case: 'the payment was refunded', message: 'Already refunded' } }),
			rule('second', 'business', { refusal: { case: 'the refund is too large', message: 'Too much' } }),
			rule('technical', 'data', { refusal: { case: 'the record is absent', message: 'Not found' } })
		];
		const text = textOf(read(action(rules, lead)));
		expect(text.split(lead)).toHaveLength(2);
		expect(text).toContain('the payment was refunded');
		expect(text).toContain('shows “Already refunded”');
		expect(text).toContain(rules[2].text);
		expect(text).not.toContain('the record is absent');
	});

	it('does not infer a category from the sentence and leaves the empty action unchanged', () => {
		const html = read(action([rule('unknown', undefined, { text: 'The system shall enforce product billing and technical security.' })]));
		expect(html).toContain('aria-label="Other rules"');
		expect(html).not.toContain('aria-label="Product rules"');
		expect(html).not.toContain('aria-label="Technical rules"');
		const empty = read(action([]));
		expect(empty).toContain('No rule: the behavior model sets no condition on this action.');
		expect(empty).not.toContain('<h4');
	});
});
