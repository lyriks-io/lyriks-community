import { isIsoInstant } from '$domain/shared';

export const RULE_CATEGORIES = ['business', 'security', 'permissions', 'compliance', 'validation', 'data', 'ux_feedback', 'error_handling', 'async', 'collaboration', 'billing_quota', 'audit'] as const;
const EFFECTS = ['set_state', 'show_message', 'emit_event', 'block_action', 'allow_action', 'transition_surface', 'append_to_list', 'remove_from_list', 'update_list_item', 'advance_time', 'invoke_operation'];
export const objectOf = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nodes = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(objectOf).filter((node): node is Record<string, unknown> => !!node) : [];

export interface EditableRule {
	readonly category: string;
	readonly description: string;
	readonly condition?: Record<string, unknown>;
	readonly effect: Record<string, unknown>;
}
export interface RuleEditRequest {
	readonly op: 'upsert_rule';
	readonly featureId: string;
	readonly actionId: string;
	readonly ruleId?: string;
	readonly expectedUpdatedAt: string;
	readonly rule: EditableRule;
}
type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Read explicit formal data; prose is a reason and never becomes a predicate. */
export function parseEditableRule(value: unknown): Parsed<EditableRule> {
	const rule = objectOf(value);
	if (!rule || !RULE_CATEGORIES.includes(rule.category as typeof RULE_CATEGORIES[number])) return fail('Choose a rule category.');
	if (typeof rule.description !== 'string' || !rule.description.trim() || rule.description.length > 4000) return fail('Explain why the rule exists, in at most 4000 characters.');
	const effect = objectOf(rule.effect);
	if (!effect || !EFFECTS.includes(String(effect.type))) return fail('Choose an explicit effect for this rule.');
	if (typeof effect.description !== 'string' || !effect.description.trim()) return fail('Explain what the chosen effect does.');
	if (effect.type === 'block_action' && (typeof effect.reason !== 'string' || !effect.reason.trim())) return fail('Say what the refusal tells the reader.');
	const condition = rule.condition == null ? undefined : objectOf(rule.condition);
	if (condition === null || (condition && !('left' in condition || ['all', 'any', 'not'].includes(String(condition.kind))))) return fail('The condition must be an explicit structured predicate, or Always.');
	return { ok: true, value: { category: rule.category as string, description: rule.description, effect, ...(condition ? { condition } : {}) } };
}

export function parseRuleEdit(value: Record<string, unknown>): Parsed<RuleEditRequest> {
	const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 300 && !/\s/.test(v);
	if (!id(value.featureId) || !id(value.actionId) || (value.ruleId !== undefined && !id(value.ruleId))) return fail('Name the feature, action and existing rule.');
	if (typeof value.expectedUpdatedAt !== 'string' || !isIsoInstant(value.expectedUpdatedAt)) return fail('Reload the rule to read its current feature version.');
	const rule = parseEditableRule(value.rule);
	return rule.ok ? { ok: true, value: { op: 'upsert_rule', featureId: value.featureId, actionId: value.actionId, ...(value.ruleId ? { ruleId: value.ruleId as string } : {}), expectedUpdatedAt: value.expectedUpdatedAt, rule: rule.value } } : rule;
}

export interface RuleTarget {
	readonly surfaceId: string;
	readonly actionId: string;
	readonly updatedAt: string;
	readonly rule: Record<string, unknown> | null;
}
/** Resolve from the project-scoped snapshot, never trust a surface supplied by a browser. */
export function ruleTarget(snapshot: unknown, actionId: string, ruleId?: string): RuleTarget | null {
	const feature = objectOf(objectOf(snapshot)?.feature);
	const matches = nodes(feature?.surfaces).flatMap((surface) => nodes(surface.actions).filter((a) => a.id === actionId).map((action) => ({ surface, action })));
	if (matches.length !== 1 || typeof feature?.updatedAt !== 'string' || !isIsoInstant(feature.updatedAt)) return null;
	const { surface, action } = matches[0];
	const rules = ruleId ? nodes(action.rules).filter((r) => r.id === ruleId) : [];
	if ((ruleId && rules.length !== 1) || typeof surface.id !== 'string') return null;
	return { surfaceId: surface.id, actionId, updatedAt: feature.updatedAt, rule: rules[0] ?? null };
}

export function ruleEditOperation(target: RuleTarget, rule: EditableRule): Record<string, unknown> {
	const { id: _id, ...effect } = rule.effect;
	const savedEffect = objectOf(target.rule?.effect);
	const value = { category: rule.category, description: rule.description, effect: { ...effect, ...(savedEffect?.id ? { id: savedEffect.id } : {}) }, ...(rule.condition ? { condition: rule.condition } : target.rule?.condition ? { condition: null } : {}) };
	return target.rule
		? { kind: 'update_action_rule', surfaceId: target.surfaceId, actionId: target.actionId, ruleId: target.rule.id, patch: value }
		: { kind: 'add_action_rule', ref: 'knowledge_rule', surfaceId: target.surfaceId, actionId: target.actionId, rule: value };
}
