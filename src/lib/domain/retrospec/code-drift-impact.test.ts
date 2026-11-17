import { describe, expect, it } from 'vitest';
import { driftImpact, driftRisk, type DriftSpecReading } from './code-drift-impact';
import type { CodeShift } from './code-drift';

const change = (kind: string, shift: CodeShift) => ({ shift, codeElement: { kind, id: 'r1', name: 'No order after 6 pm', actionId: 'a1' } });
const placeOrder: NonNullable<DriftSpecReading['action']> = {
	name: 'Place an order',
	who: ['Customer', 'Baker'],
	writes: ['order.status', 'order.total'],
	scenarios: ['Order before 6 pm', 'Order refused after 6 pm', 'Order with an empty basket', 'Order for tomorrow']
};
const reading = (over: Partial<DriftSpecReading> = {}): DriftSpecReading => ({
	featureName: 'Ordering',
	action: placeOrder,
	rule: 'When the customer asks to place an order, if the hour is 18 or later, then the system shall refuse to place an order.',
	...over
});

describe('the impact of a code change, read from the spec [criterion:94d2468a]', () => {
	it('rates by a fixed rule: what is lost or guards data weighs most, a move least', () => {
		expect(driftRisk(change('rule', 'gone'), false)).toBe('high');
		expect(driftRisk(change('action', 'gone'), false)).toBe('high');
		expect(driftRisk(change('event', 'gone'), true)).toBe('medium');
		expect(driftRisk(change('rule', 'changed'), true)).toBe('high');
		expect(driftRisk(change('invariant', 'changed'), false)).toBe('medium');
		expect(driftRisk(change('action', 'changed'), true)).toBe('medium');
		expect(driftRisk(change('action', 'changed'), false)).toBe('low');
		expect(driftRisk(change('transition', 'changed'), true)).toBe('low');
		expect(driftRisk(change('rule', 'moved'), true)).toBe('low');
	});

	it('names the feature, the action, the rule, who performs it, the data it writes and the scenarios that check it', () => {
		const impact = driftImpact(change('rule', 'changed'), reading());
		expect(impact.risk).toBe('high');
		expect(impact.rows).toEqual([
			{ key: 'feature', value: 'Ordering' },
			{ key: 'action', value: 'Place an order' },
			{ key: 'rule', value: reading().rule },
			{ key: 'profile', value: 'Customer, Baker' },
			{ key: 'data', value: 'order.status, order.total' },
			{ key: 'tests', value: '4 scenarios to run again: Order before 6 pm · Order refused after 6 pm · Order with an empty basket and 1 more' }
		]);
		expect(impact.summary).toBe(
			'A guard reads differently in the code: what it lets through may have changed. Customer and Baker may perform “Place an order”; it writes 2 fields; 4 scenarios check it.'
		);
	});

	it('says what the spec says when nobody is granted the action, it writes nothing and nothing checks it', () => {
		const bare = driftImpact(change('action', 'changed'), reading({ action: { name: 'Browse', who: [], writes: [], scenarios: [] }, rule: null }));
		expect(bare.risk).toBe('low');
		expect(bare.rows.map((r) => r.key)).toEqual(['feature', 'action', 'profile', 'data', 'tests']);
		expect(bare.rows.slice(2).map((r) => r.value)).toEqual(['No profile is granted this action in the spec', 'Writes no data', 'No scenario checks this action']);
		expect(bare.summary).toContain('No profile is granted “Browse” in the spec; it writes no data; no scenario checks it.');
	});

	it('leaves out what the spec does not say: no action, only the feature and why', () => {
		const lone = driftImpact(change('event', 'gone'), reading({ action: null, rule: null }));
		expect(lone).toEqual({ risk: 'medium', summary: 'An element of the spec is no longer found in the code.', rows: [{ key: 'feature', value: 'Ordering' }] });
	});

	it('reads the same change the same way every time', () => {
		expect(driftImpact(change('rule', 'gone'), reading())).toEqual(driftImpact(change('rule', 'gone'), reading()));
	});
});
