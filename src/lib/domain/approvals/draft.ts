import type { ApprovalStatus } from './enums';

/**
 * One review/approval item: a named thing to sign off (a spec area, a milestone,
 * a decision), with a reviewer, a status, an optional deadline, and a note that
 * doubles as the review comment / accepted-risk rationale. A lightweight, general
 * approval worklist — not a workflow engine.
 */
export interface ApprovalItem {
	readonly id: string;
	title: string;
	area: string;
	reviewer: string;
	status: ApprovalStatus;
	deadline: string;
	note: string;
}

export interface ProjectApprovalsDraft {
	projectId: string;
	items: ApprovalItem[];
	lastSavedAt: string | null;
}

export function createEmptyApprovalsDraft(projectId: string): ProjectApprovalsDraft {
	return { projectId, items: [], lastSavedAt: null };
}

export function createApprovalItem(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
	return {
		id: crypto.randomUUID(),
		title: '',
		area: 'Whole specification',
		reviewer: '',
		status: 'draft',
		deadline: '',
		note: '',
		...overrides
	};
}
