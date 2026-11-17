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
	/** Who last moved the status, stamped by the server from the session; null while it never moved. */
	readonly decidedBy: ApprovalDecider | null;
	/** When the status last moved, stamped by the server. */
	readonly decidedAt: string | null;
}

/** The person a status change is recorded against: the session's, never a name the caller typed. */
export interface ApprovalDecider {
	readonly id: string;
	readonly name: string;
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
		decidedBy: null,
		decidedAt: null,
		...overrides
	};
}
