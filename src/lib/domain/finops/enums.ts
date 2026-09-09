/**
 * Closed vocabularies for the AI Cost Governor capability. Source of truth:
 * Unspaghettit feature `133c6adc`. Codes are persisted; labels are the plain
 * display copy shown in the UI.
 */

import type { Option } from '$domain/shared';

/** The three tabs mirror the three surfaces of the unspa feature. */
export type FinopsTab = 'cockpit' | 'compiler' | 'gateway';
export const FINOPS_TABS = [
	{ code: 'cockpit', label: 'Cost Governor' },
	{ code: 'compiler', label: 'Rule Compiler' },
	{ code: 'gateway', label: 'Gateway Sync' }
] as const satisfies readonly Option[];
export const isFinopsTab = (v: unknown): v is FinopsTab =>
	v === 'cockpit' || v === 'compiler' || v === 'gateway';

/**
 * How hard the governor bites. `advisory` only surfaces warnings (the air-gap
 * default — generation is never frozen); `enforced` actually freezes generation
 * and pushes blocking rules to the LiteLLM proxy.
 */
export const ENFORCEMENT_MODES = [
	{ code: 'advisory', label: 'Advisory' },
	{ code: 'enforced', label: 'Enforced' }
] as const satisfies readonly Option[];
export type EnforcementMode = (typeof ENFORCEMENT_MODES)[number]['code'];
export const isEnforcementMode = (v: unknown): v is EnforcementMode =>
	v === 'advisory' || v === 'enforced';

/** The three LiteLLM guardrail rule kinds the compiler can derive. */
export const RULE_KINDS = [
	{ code: 'block_scope', label: 'Block scope' },
	{ code: 'route_cheap_model', label: 'Route to cheaper model' },
	{ code: 'budget_cap', label: 'Cap budget' }
] as const satisfies readonly Option[];
export type RuleKind = (typeof RULE_KINDS)[number]['code'];
export const isRuleKind = (v: unknown): v is RuleKind =>
	RULE_KINDS.some((k) => k.code === v);

/** Lifecycle of one compiled rule. */
export const RULE_STATUSES = [
	{ code: 'proposed', label: 'Proposed' },
	{ code: 'active', label: 'Active' },
	{ code: 'retired', label: 'Retired' }
] as const satisfies readonly Option[];
export type RuleStatus = (typeof RULE_STATUSES)[number]['code'];
export const isRuleStatus = (v: unknown): v is RuleStatus =>
	v === 'proposed' || v === 'active' || v === 'retired';

/**
 * What produced a rule: one of the three live signals the compiler reads, or
 * `manual` when an operator added the guardrail by hand from the Advanced panel.
 */
export const RULE_SOURCES = [
	// `maturity` is the persisted legacy code; the signal it names is Build Readiness.
	{ code: 'maturity', label: 'Scope readiness' },
	{ code: 'coherence', label: 'Coherence' },
	{ code: 'budget', label: 'Budget' },
	{ code: 'manual', label: 'Manual' }
] as const satisfies readonly Option[];
export type RuleSource = (typeof RULE_SOURCES)[number]['code'];
export const isRuleSource = (v: unknown): v is RuleSource =>
	v === 'maturity' || v === 'coherence' || v === 'budget' || v === 'manual';
