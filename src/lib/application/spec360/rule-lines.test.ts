import { describe, expect, it } from 'vitest';
import type { ActionRule } from './features';
import { groupedRuleLines, ruleDisplayGroup, ruleLines } from './rule-lines';

const rule = (id: string, refusal?: { case: string; message: string }): ActionRule => ({ id, text: `The system shall ${id}.`, kind: 'rule', blocks: !!refusal, ...(refusal ? { refusal } : {}) });

describe('every rule reads inline under its action [criterion:7d1e80b6]', () => {
	it('reads the sentence the refusals share once, one line per condition with its message, then the other rules', () => {
		const lead = 'When the user places a machine, the system shall refuse if any of these holds:';
		const lines = ruleLines({ refusalLead: lead, rules: [rule('plain'), rule('viewer', { case: 'the role is "viewer"', message: 'forbidden' }), rule('blank', { case: 'the name is ""', message: 'A machine needs a name.' })] });
		expect(lines.lead).toBe(lead);
		expect(lines.refusals.map((r) => [r.rule.id, r.condition, r.message])).toEqual([
			['viewer', 'the role is "viewer"', 'forbidden'],
			['blank', 'the name is ""', 'A machine needs a name.']
		]);
		expect(lines.others.map((r) => r.id)).toEqual(['plain']);
	});

	it('reads each rule whole when no refusals share a sentence', () => {
		const lines = ruleLines({ refusalLead: null, rules: [rule('a'), rule('b', { case: 'never read', message: 'nor this' })] });
		expect(lines.lead).toBeNull();
		expect(lines.refusals).toEqual([]);
		expect(lines.others.map((r) => r.id)).toEqual(['a', 'b']);
	});
});

describe('saved categories determine the display groups [criterion:ad995374]', () => {
	it.each(['business', 'billing_quota', 'permissions', 'compliance'])('reads %s as Product rules', (category) => {
		expect(ruleDisplayGroup({ kind: 'rule', category })).toBe('product');
	});
	it.each(['security', 'validation', 'data', 'error_handling'])('reads %s as Technical rules', (category) => {
		expect(ruleDisplayGroup({ kind: 'rule', category })).toBe('technical');
	});
	it.each([undefined, '', 'ux_feedback', 'async', 'collaboration', 'audit', 'future_category', 'BUSINESS'])('keeps the unmapped category %s neutral', (category) => {
		expect(ruleDisplayGroup({ kind: 'rule', category })).toBe('other');
	});
	it('keeps an invariant neutral even if it carries a category', () => {
		expect(ruleDisplayGroup({ kind: 'invariant', category: 'business' })).toBe('other');
	});
	it('never derives a group from technical or business words in its sentence', () => {
		const groups = groupedRuleLines({ refusalLead: null, rules: [{ ...rule('uncategorized'), text: 'The system shall enforce business billing and technical security.' }] });
		expect(groups.map((group) => group.kind)).toEqual(['other']);
	});
});

describe('grouping preserves rule identity and order [criterion:d9c7ce1a]', () => {
	const ids = (groups: ReturnType<typeof groupedRuleLines>) => groups.map((group) => ({ kind: group.kind, ids: group.runs.flatMap((run) => [...run.refusals.map((r) => r.rule.id), ...run.others.map((r) => r.id)]) }));
	it('reads Product then Technical then Other, retaining the input order within each group', () => {
		const rules = [
			{ ...rule('tech-a'), category: 'data' },
			{ ...rule('product-a'), category: 'business' },
			rule('other-a'),
			{ ...rule('tech-b'), category: 'validation' },
			{ ...rule('product-b'), category: 'permissions' }
		];
		const before = JSON.stringify(rules);
		const groups = groupedRuleLines({ refusalLead: null, rules: Object.freeze(rules.map((r) => Object.freeze(r))) });
		expect(ids(groups)).toEqual([{ kind: 'product', ids: ['product-a', 'product-b'] }, { kind: 'technical', ids: ['tech-a', 'tech-b'] }, { kind: 'other', ids: ['other-a'] }]);
		expect(groups[0].runs[0].others[0]).toBe(rules[1]);
		expect(JSON.stringify(rules)).toBe(before);
	});
	it('omits empty groups, including an entirely empty action', () => {
		expect(groupedRuleLines({ refusalLead: null, rules: [] })).toEqual([]);
		expect(groupedRuleLines({ refusalLead: null, rules: [{ ...rule('tech'), category: 'security' }] }).map((group) => group.title)).toEqual(['Technical rules']);
	});
	it('factors consecutive refusals within one category group without moving ordinary rules', () => {
		const refusal = { case: 'the reader is absent', message: 'Sign in.' };
		const rules = ['first', 'second', 'plain', 'last'].map((id) => ({ ...rule(id, id === 'plain' ? undefined : refusal), category: 'business' }));
		const groups = groupedRuleLines({ refusalLead: 'The system shall refuse if:', rules });
		expect(ids(groups)[0].ids).toEqual(['first', 'second', 'plain', 'last']);
		expect(groups[0].runs.map((run) => run.lead)).toEqual(['The system shall refuse if:', null, null]);
		expect(groups[0].runs[2].others[0]).toBe(rules[3]);
	});
	it('does not share a refusal sentence across product and technical groups', () => {
		const refusal = { case: 'the reader is absent', message: 'Sign in.' };
		const groups = groupedRuleLines({ refusalLead: 'The system shall refuse if:', rules: [{ ...rule('product', refusal), category: 'permissions' }, { ...rule('technical', refusal), category: 'security' }] });
		expect(groups.flatMap((group) => group.runs.map((run) => run.lead))).toEqual([null, null]);
		expect(groups.flatMap((group) => group.runs.flatMap((run) => run.others.map((r) => r.text)))).toEqual(['The system shall product.', 'The system shall technical.']);
	});
});
