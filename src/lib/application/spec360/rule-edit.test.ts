import { describe, expect, it } from 'vitest';
import { parseSpecEdit } from '$application/specification/parse-spec-edit';
import { parseEditableRule, ruleEditOperation, ruleTarget } from './rule-edit';

const stamp = '2026-11-13T03:00:00.000Z';
const effect = { id: 'effect-1', type: 'block_action', reason: 'Not allowed.', description: 'Retain the signed policy.' };
const condition = { kind: 'all', conditions: [{ left: 'account.active', operator: 'is_true' }, { left: { kind: 'param', name: 'amount' }, operator: 'lower_or_equal', right: { kind: 'state', path: 'balance.available' } }] };
const rule = { id: 'rule-1', category: 'business', description: 'The payment must remain funded.', condition, effect };
const snapshot = { feature: { updatedAt: stamp, surfaces: [{ id: 'surface-1', actions: [{ id: 'action-1', rules: [rule] }] }] } };

describe('explicit rule editing [criterion:1df36a35]', () => {
	it('preserves nested predicates, expressions and effect identity without interpreting prose', () => {
		const before = JSON.stringify(snapshot);
		const parsed = parseEditableRule(JSON.parse(JSON.stringify(rule)));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const op = ruleEditOperation(ruleTarget(snapshot, 'action-1', 'rule-1')!, parsed.value);
		expect(op).toMatchObject({ kind: 'update_action_rule', surfaceId: 'surface-1', actionId: 'action-1', ruleId: 'rule-1', patch: { condition, effect } });
		expect(JSON.stringify(snapshot)).toBe(before);
	});

	it('does not turn a reason or a blank effect into an unconditional allowance', () => {
		expect(parseEditableRule({ category: 'business', description: 'Only an owner can refund.' }).ok).toBe(false);
		expect(parseEditableRule({ ...rule, effect: {} }).ok).toBe(false);
		expect(parseEditableRule({ ...rule, condition: 'Only an owner' }).ok).toBe(false);
	});

	it('requires a refusal message and an effect explanation', () => {
		expect(parseEditableRule({ ...rule, effect: { ...effect, reason: '' } }).ok).toBe(false);
		expect(parseEditableRule({ ...rule, effect: { ...effect, description: '' } }).ok).toBe(false);
	});

	it('accepts an explicitly chosen unconditional allowance without inventing a condition', () => {
		const parsed = parseEditableRule({ category: 'permissions', description: 'Every project reader can inspect.', effect: { type: 'allow_action', description: 'Permit inspection.' } });
		expect(parsed).toMatchObject({ ok: true, value: { effect: { type: 'allow_action' } } });
		if (parsed.ok) expect(parsed.value).not.toHaveProperty('condition');
	});

	it('does not accept a request without the canonical feature version', () => {
		expect(parseSpecEdit({ op: 'upsert_rule', featureId: 'f', actionId: 'action-1', rule }).ok).toBe(false);
		expect(parseSpecEdit({ op: 'upsert_rule', featureId: 'f', actionId: 'action-1', rule, expectedUpdatedAt: stamp }).ok).toBe(true);
	});

	it('refuses missing or ambiguous action and rule targets', () => {
		expect(ruleTarget(snapshot, 'missing')).toBeNull();
		expect(ruleTarget(snapshot, 'action-1', 'foreign-rule')).toBeNull();
		const surface = snapshot.feature.surfaces[0];
		expect(ruleTarget({ feature: { ...snapshot.feature, surfaces: [surface, { ...surface, id: 'other' }] } }, 'action-1')).toBeNull();
	});

	it('lets the engine mint new identities and preserves the old effect identity on edit', () => {
		const parsed = parseEditableRule(rule);
		if (!parsed.ok) throw new Error(parsed.reason);
		const create = ruleEditOperation(ruleTarget(snapshot, 'action-1')!, parsed.value);
		expect(create).toMatchObject({ kind: 'add_action_rule', ref: 'knowledge_rule' });
		expect((create.rule as typeof rule).effect).not.toHaveProperty('id');
		const update = ruleEditOperation(ruleTarget(snapshot, 'action-1', 'rule-1')!, { ...parsed.value, effect: { ...effect, id: 'foreign-effect' } });
		expect((update.patch as typeof rule).effect.id).toBe('effect-1');
	});
});
