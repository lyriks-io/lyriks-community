import type {
	AssignmentStatus,
	DecisionArea,
	GatewayStatus,
	PolicyCategory,
	PolicyStatus,
	ScopeType
} from './enums';

/* ── Entities — mirror of Unspaghettit feature 3d1cc881 ─────────────── */

/** One scope handed to a team member: what to specify, who owns it, how far along. */
export interface Assignment {
	readonly id: string;
	assignee: string;
	scopeType: ScopeType;
	scopeLabel: string;
	status: AssignmentStatus;
	progress: number;
	dueInDays: number;
	updatedAt: string;
}

/** One line in the recent-activity feed. Read-only, aggregated across the project. */
export interface ActivityEntry {
	readonly id: string;
	actor: string;
	action: string;
	target: string;
	ago: string;
	daysAgo: number;
}

/** One AI usage-policy rule the gateway monitors. */
export interface PolicyRule {
	readonly id: string;
	category: PolicyCategory;
	label: string;
	status: PolicyStatus;
	detail: string;
}

/** One recorded project decision — the traceability trail behind the spec. */
export interface Decision {
	readonly id: string;
	title: string;
	rationale: string;
	by: string;
	area: DecisionArea;
	when: string;
}

/** One line of real AI Gateway traffic the proxy logged. Read-only mirror. */
export interface GatewayAuditEntry {
	readonly id: string;
	actor: string;
	model: string;
	tokens: number;
	cost: number;
	status: GatewayStatus;
	reason: string;
	/** Best-effort "3h ago" recency string mirrored from the proxy log. */
	when: string;
}

/**
 * One member's LiteLLM virtual key — the per-person budget & quota the gateway
 * attributes real AI spend to. The `member` matches a task-board assignee, so a
 * person's tasks and their AI usage roll up under the same name. Local by default
 * (advisory); a real proxy key is provisioned per member as an optional path.
 */
export interface GatewayKey {
	/** Team member this key belongs to — same string as the assignment assignee. */
	member: string;
	monthlyBudgetUsd: number;
	spentUsd: number;
	tokensUsed: number;
	tokenQuota: number;
}

/** The persisted content of the Supervision capability across its four tabs. */
export interface ProjectSupervisionDraft {
	projectId: string;
	assignments: Assignment[];
	activity: ActivityEntry[];
	policyRules: PolicyRule[];
	decisions: Decision[];
	/** Per-member LiteLLM virtual keys — the "AI usage by member" ledger. */
	memberKeys: GatewayKey[];
	/** Per-member real-call audit trail the proxy logged (read-only mirror). */
	gatewayAudit: GatewayAuditEntry[];
	lastSavedAt: string | null;
}

export function createEmptySupervisionDraft(projectId: string): ProjectSupervisionDraft {
	return {
		projectId,
		assignments: [],
		activity: [],
		policyRules: [],
		decisions: [],
		memberKeys: [],
		gatewayAudit: [],
		lastSavedAt: null
	};
}

export function createGatewayKey(overrides: Partial<GatewayKey> = {}): GatewayKey {
	return {
		member: '',
		monthlyBudgetUsd: 50,
		spentUsd: 0,
		tokensUsed: 0,
		tokenQuota: 1_000_000,
		...overrides
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createAssignment(overrides: Partial<Assignment> = {}): Assignment {
	return {
		id: newId(),
		assignee: '',
		scopeType: 'step',
		scopeLabel: '',
		status: 'todo',
		progress: 0,
		dueInDays: 3,
		updatedAt: 'just now',
		...overrides
	};
}

export function createPolicyRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
	return {
		id: newId(),
		category: 'tool',
		label: '',
		status: 'ok',
		detail: '',
		...overrides
	};
}

export function createDecision(overrides: Partial<Decision> = {}): Decision {
	return {
		id: newId(),
		title: '',
		rationale: '',
		by: '',
		area: 'feature',
		when: 'just now',
		...overrides
	};
}

/** Progress a status implies when an assignment is advanced or set directly. */
export function progressForStatus(status: AssignmentStatus, current = 0): number {
	switch (status) {
		case 'todo':
			return 0;
		case 'doing':
			return Math.max(current, 30);
		case 'review':
			return Math.max(current, 80);
		case 'done':
			return 100;
	}
}
