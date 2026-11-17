import { describe, expect, it } from 'vitest';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { SpecProof } from '../ports';
import { featureRuleVerdicts } from './rule-verdicts';

// Draft feat-rules-edge-cases of request eeda5853: every rule of the inventory
// carries what the solver says about it, never more than the proof settled.

const cond = { left: 'cart.total', operator: 'greater_than', right: 0 };
const snapshot = {
	feature: {
		id: 'feat-cart',
		name: 'Cart',
		featureInvariants: [
			{ id: 'inv-broken', name: 'Total stays positive', condition: cond },
			{ id: 'inv-held', name: 'Lines are counted', condition: cond },
			{ id: 'inv-unread', name: 'Dates in order', condition: cond },
			{ id: 'inv-open', name: 'Stock is kept', condition: cond },
			{ id: 'inv-unsearched', name: 'Never searched', condition: cond }
		],
		surfaces: [
			{
				id: 's',
				name: 'Cart',
				rules: [{ id: 'r-surface', condition: cond, effect: { type: 'block_action' } }],
				invariants: [],
				actions: [
					{
						id: 'a-pay',
						name: 'Pay',
						rules: [
							{ id: 'r-dead', condition: cond, effect: { type: 'block_action' } },
							{ id: 'r-hidden', condition: cond, effect: { type: 'block_action' } },
							{ id: 'r-redundant', condition: cond, effect: { type: 'block_action' } },
							{ id: 'r-sound', condition: cond, effect: { type: 'block_action' } },
							{ id: 'r-open', condition: cond, effect: { type: 'block_action' } },
							{ id: 'r-always', effect: { type: 'allow_action' } }
						]
					},
					{ id: 'a-wrap', name: 'Gift wrap', rules: [] }
				]
			}
		]
	}
} as unknown as UnspaFeatureSnapshot;

const proof: SpecProof = {
	solver: 'ran',
	questions: 40,
	unsettled: 3,
	rulesSettled: ['r-dead', 'r-hidden', 'r-redundant', 'r-sound', 'r-surface'],
	paths: {
		maxSteps: 6,
		results: [
			{ invariantId: 'inv-broken', invariantName: 'Total stays positive', outcome: 'violated', steps: 1 },
			{ invariantId: 'inv-held', invariantName: 'Lines are counted', outcome: 'none-within-bound' },
			{ invariantId: 'inv-unread', invariantName: 'Dates in order', outcome: 'unsupported', reason: 'reads a date' },
			{ invariantId: 'inv-open', invariantName: 'Stock is kept', outcome: 'unsettled' }
		]
	},
	leads: [],
	findings: [
		{ kind: 'dead-rule', severity: 'critical', detail: 'dead', ruleId: 'r-dead', actionId: 'a-pay', actionName: 'Pay' },
		{ kind: 'shadowed-rule', severity: 'recommended', detail: 'hidden', ruleId: 'r-hidden', actionId: 'a-pay', actionName: 'Pay' },
		{ kind: 'redundant-rule', severity: 'recommended', detail: 'repeats', ruleId: 'r-redundant', actionId: 'a-pay' },
		{ kind: 'always-blocked', severity: 'recommended', detail: 'refused', actionId: 'a-wrap', actionName: 'Gift wrap' },
		{
			kind: 'reachable-violation',
			severity: 'critical',
			detail: 'breaks',
			invariantId: 'inv-broken',
			invariantName: 'Total stays positive',
			path: [{ actionId: 'a-pay', actionName: 'Pay', surfaceId: 's', parameters: { amount: 5 } }]
		}
	]
};

describe('featureRuleVerdicts', () => {
	const read = featureRuleVerdicts('feat-cart', snapshot, proof);
	const kindOf = (id: string) => read.rules[id]?.kind;

	it('names each rule flaw the solver proved, with its proof as a scenario', () => {
		expect(kindOf('r-dead')).toBe('dead');
		expect(kindOf('r-hidden')).toBe('hidden');
		expect(read.rules['r-dead']?.detail).toMatch(/^Given any state, when Pay with any input, then this rule never applies\.$/);
		expect(read.rules['r-dead']?.fix).toBeTruthy();
	});

	it('says a rule repeats a validation without counting it as a flaw', () => {
		expect(read.rules['r-redundant']).toMatchObject({ kind: 'redundant', flaw: false });
	});

	it('reads no flaw only for a rule the solver settled, and not settled otherwise', () => {
		expect(kindOf('r-sound')).toBe('no-flaw');
		expect(kindOf('r-surface')).toBe('no-flaw');
		expect(kindOf('r-open')).toBe('not-settled');
	});

	it('gives a rule with no condition no verdict at all', () => {
		expect(read.rules['r-always']).toBeUndefined();
	});

	it('reads each statement as its path search left it, a bounded search never as proved', () => {
		expect(read.rules['inv-broken']).toMatchObject({ kind: 'broken', flaw: true });
		expect(read.rules['inv-broken']?.detail).toContain('Pay (amount 5)');
		expect(read.rules['inv-held']).toMatchObject({ kind: 'holds-within-bound', label: 'Holds for 6 steps' });
		expect(read.rules['inv-unread']).toMatchObject({ kind: 'not-read', detail: 'reads a date' });
		expect(kindOf('inv-open')).toBe('unsettled');
		expect(kindOf('inv-unsearched')).toBe('not-settled');
	});

	it('puts an action verdict on the action, and counts every flaw', () => {
		expect(read.actions['a-wrap']).toMatchObject({ kind: 'always-refused', flaw: true });
		// dead, hidden, broken, always refused.
		expect(read.flaws).toBe(4);
	});

	it('trusts a rule as sound from an engine that does not list settled rules only when nothing was left open', () => {
		const { rulesSettled: _omit, ...older } = proof;
		expect(featureRuleVerdicts('feat-cart', snapshot, older).rules['r-sound']?.kind).toBe('not-settled');
		const closed = { ...older, unsettled: 0 };
		expect(featureRuleVerdicts('feat-cart', snapshot, closed).rules['r-sound']?.kind).toBe('no-flaw');
	});

	it('gives no verdict when the solver did not start, and says why', () => {
		const none = featureRuleVerdicts('feat-cart', snapshot, { ...proof, solver: 'unavailable', reason: 'z3-solver is missing' });
		expect(none).toMatchObject({ solver: 'unavailable', rules: {}, actions: {}, flaws: 0 });
		expect(none.scope?.text).toContain('nothing here is proven');
	});

	it('lets the rule checks speak only for the rules, and the path search only for the statements', () => {
		const rules = featureRuleVerdicts('feat-cart', snapshot, proof, 'en', 'rules');
		expect(rules.rules['r-dead']?.kind).toBe('dead');
		expect(rules.rules['r-redundant']?.kind).toBe('redundant');
		expect(rules.actions['a-wrap']?.kind).toBe('always-refused');
		expect(rules.rules['inv-broken']).toBeUndefined();
		expect(rules.rules['inv-held']).toBeUndefined();
		const statements = featureRuleVerdicts('feat-cart', snapshot, proof, 'en', 'statements');
		expect(statements.rules['inv-broken']?.kind).toBe('broken');
		expect(statements.rules['inv-held']?.kind).toBe('holds-within-bound');
		expect(statements.rules['r-dead']).toBeUndefined();
		expect(statements.rules['r-sound']).toBeUndefined();
		expect(statements.actions['a-wrap']).toBeUndefined();
	});

	it('says how many rules the rule checks left open, never a path bound they did not search', () => {
		const rules = featureRuleVerdicts('feat-cart', snapshot, proof, 'en', 'rules');
		expect(rules.scope).toEqual({
			text: 'The solver did not settle 1 rule in its time: it reads Not settled, never sound.',
			open: true
		});
		const all = { ...proof, rulesSettled: [...(proof.rulesSettled ?? []), 'r-open'] };
		expect(featureRuleVerdicts('feat-cart', snapshot, all, 'en', 'rules').scope).toBeNull();
	});

	it('writes its words in French for a French spec', () => {
		const fr = featureRuleVerdicts('feat-cart', snapshot, proof, 'fr');
		expect(fr.rules['r-dead']?.label).toBe('Règle morte');
		expect(fr.rules['inv-held']?.label).toBe('Tenu sur 6 étapes');
		expect(fr.rules['r-sound']?.label).toBe('Aucun défaut trouvé');
	});
});
