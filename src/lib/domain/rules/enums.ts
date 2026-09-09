/**
 * Closed vocabularies for Step 06 — Rules And Edge Cases. Source of truth:
 * Unspaghettit feature `e06f420a`. Codes are persisted; labels are the plain,
 * non-technical display copy shown in the UI.
 */

import type { Option } from '$domain/shared';

export type RulesTab = 'inventory' | 'edge_cases';

/** What kind of problem an Issue is. Plain labels — no behavioral-model jargon. */
export const ISSUE_KINDS = [
	{ code: 'contradiction', label: 'Contradiction', hint: 'Two rules disagree' },
	{ code: 'missing_rule', label: 'Missing rule', hint: 'A case nobody decided' },
	{ code: 'ambiguity', label: 'Ambiguity', hint: 'A term that needs defining' },
	{ code: 'overlap', label: 'Overlap', hint: 'Two rules say the same thing' },
	{ code: 'dead_rule', label: 'Dead rule', hint: 'A rule that can never apply' },
	{ code: 'unreachable_state', label: 'Unreachable state', hint: 'A state nothing can reach' },
	{ code: 'unhandled_edge', label: 'Unhandled edge', hint: 'A failure with no behavior' }
] as const satisfies readonly Option[];
export type IssueKind = (typeof ISSUE_KINDS)[number]['code'];
export const isIssueKind = (v: unknown): v is IssueKind =>
	typeof v === 'string' && (ISSUE_KINDS as readonly Option[]).some((k) => k.code === v);

export const ISSUE_SEVERITIES = [
	{ code: 'critical', label: 'Critical', hint: 'Must fix before the build' },
	{ code: 'major', label: 'Major' },
	{ code: 'minor', label: 'Minor' }
] as const satisfies readonly Option[];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]['code'];

export const ISSUE_STATUSES = [
	{ code: 'open', label: 'Open' },
	{ code: 'in_review', label: 'In review' },
	{ code: 'resolved', label: 'Resolved' },
	{ code: 'accepted_risk', label: 'Accepted risk' },
	{ code: 'wont_fix', label: "Won't fix" }
] as const satisfies readonly Option[];
export type IssueStatus = (typeof ISSUE_STATUSES)[number]['code'];
/** Statuses that count an issue as "dealt with" for coherence + the advance gate. */
export const SETTLED_STATUSES: readonly IssueStatus[] = ['resolved', 'accepted_risk', 'wont_fix'];

/** Headline expected result of an edge-case scenario. */
export const EDGE_OUTCOMES = [
	{ code: 'success', label: 'Succeeds' },
	{ code: 'blocked', label: 'Blocked' },
	{ code: 'error', label: 'Shows an error' }
] as const satisfies readonly Option[];
export type EdgeOutcome = (typeof EDGE_OUTCOMES)[number]['code'];

/** Category a consolidated rule belongs to (aligned with Unspaghettit's rule categories). */
export const RULE_CATEGORIES = [
	{ code: 'business', label: 'Business' },
	{ code: 'permissions', label: 'Permissions' },
	{ code: 'validation', label: 'Validation' }
] as const satisfies readonly Option[];
export type RuleCategory = (typeof RULE_CATEGORIES)[number]['code'];

/** Which earlier step a consolidated rule was declared in. */
export const RULE_SOURCES = [
	{ code: 'definition_rule', label: 'Foundation · business rule' },
	{ code: 'sla', label: 'Foundation · SLA' },
	{ code: 'security', label: 'Foundation · security' },
	{ code: 'permission', label: 'Users · permission' },
	{ code: 'journey', label: 'Experience · journey' }
] as const satisfies readonly Option[];
export type RuleSource = (typeof RULE_SOURCES)[number]['code'];
