/**
 * Closed vocabularies for the Supervision capability. Source of truth:
 * Unspaghettit feature `3d1cc881`. Codes are persisted; labels are the plain
 * display copy shown in the UI.
 */

import type { Option } from '$domain/shared';

export type SupervisionTab = 'tasks' | 'policy' | 'gateway' | 'traceability';
export const SUPERVISION_TABS = [
	{ code: 'tasks', label: 'Task tracking' },
	{ code: 'policy', label: 'AI policy' },
	{ code: 'gateway', label: 'AI Gateway' },
	{ code: 'traceability', label: 'Traceability' }
] as const satisfies readonly Option[];
export const isSupervisionTab = (v: unknown): v is SupervisionTab =>
	v === 'tasks' || v === 'policy' || v === 'gateway' || v === 'traceability';

/** The kind of scope a member is asked to specify. */
export const SCOPE_TYPES = [
	{ code: 'step', label: 'Section' },
	{ code: 'core', label: 'Core / domain' },
	{ code: 'topic', label: 'Free topic' }
] as const satisfies readonly Option[];
export type ScopeType = (typeof SCOPE_TYPES)[number]['code'];
export const isScopeType = (v: unknown): v is ScopeType =>
	v === 'step' || v === 'core' || v === 'topic';

/** Lifecycle of one assignment. Order drives the click-to-advance cycle. */
export const ASSIGNMENT_STATUSES = [
	{ code: 'todo', label: 'To do' },
	{ code: 'doing', label: 'In progress' },
	{ code: 'review', label: 'In review' },
	{ code: 'done', label: 'Done' }
] as const satisfies readonly Option[];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]['code'];
export const ASSIGNMENT_STATUS_ORDER: readonly AssignmentStatus[] = [
	'todo',
	'doing',
	'review',
	'done'
];
export const isAssignmentStatus = (v: unknown): v is AssignmentStatus =>
	ASSIGNMENT_STATUS_ORDER.includes(v as AssignmentStatus);

/** Which policy family a monitored AI usage rule belongs to. */
export const POLICY_CATEGORIES = [
	{ code: 'tool', label: 'Approved tools' },
	{ code: 'data', label: 'Admissible data' },
	{ code: 'review', label: 'Required reviews' }
] as const satisfies readonly Option[];
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number]['code'];
export const isPolicyCategory = (v: unknown): v is PolicyCategory =>
	v === 'tool' || v === 'data' || v === 'review';

/** Compliance status of an AI policy rule. */
export const POLICY_STATUSES = [
	{ code: 'ok', label: 'Compliant' },
	{ code: 'warn', label: 'Watch' },
	{ code: 'violation', label: 'Violation' }
] as const satisfies readonly Option[];
export type PolicyStatus = (typeof POLICY_STATUSES)[number]['code'];
export const isPolicyStatus = (v: unknown): v is PolicyStatus =>
	v === 'ok' || v === 'warn' || v === 'violation';

/** The capability area a logged decision touches. */
export const DECISION_AREAS = [
	{ code: 'feature', label: 'Feature' },
	{ code: 'glossary', label: 'Glossary' },
	{ code: 'infrastructure', label: 'Infrastructure' },
	{ code: 'users', label: 'Users' },
	{ code: 'rules', label: 'Rules' },
	{ code: 'experience', label: 'Experience' }
] as const satisfies readonly Option[];
export type DecisionArea = (typeof DECISION_AREAS)[number]['code'];
export const isDecisionArea = (v: unknown): v is DecisionArea =>
	DECISION_AREAS.some((a) => a.code === v);

/** Gateway verdict on one logged AI call. */
export type GatewayStatus = 'ok' | 'blocked' | 'flagged';
