import type { Option } from '$domain/shared';

/** Where an approval item sits in its review lifecycle. */
export const APPROVAL_STATUSES = [
	{ code: 'draft', label: 'Draft' },
	{ code: 'in_review', label: 'In review' },
	{ code: 'approved', label: 'Approved' },
	{ code: 'changes_requested', label: 'Changes requested' },
	{ code: 'accepted_risk', label: 'Accepted risk' }
] as const satisfies readonly Option[];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]['code'];
export const isApprovalStatus = (v: unknown): v is ApprovalStatus =>
	typeof v === 'string' && (APPROVAL_STATUSES as readonly Option[]).some((s) => s.code === v);

/** Statuses that count an item as "settled" for the summary. */
export const SETTLED_APPROVAL_STATUSES: readonly ApprovalStatus[] = ['approved', 'accepted_risk'];

/** The spec areas an approval can target — kept aligned with the nav's Specify group. */
export const APPROVAL_AREAS = [
	'Whole specification',
	'Foundation',
	'Users & Permissions',
	'Features',
	'Experience',
	'Functional',
	'Infrastructure & Data',
	'Rules & edge cases',
	'Documents & Sources',
	'AI Governance'
] as const;
