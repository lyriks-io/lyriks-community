export const SCOPE_MODES = [
	'unclassified',
	'full_product',
	'selected_scope',
	'prototype'
] as const;
export type ScopeMode = (typeof SCOPE_MODES)[number];

export const CAPABILITY_DISPOSITIONS = [
	'unresolved',
	'included',
	'excluded',
	'deferred'
] as const;
export type CapabilityDisposition = (typeof CAPABILITY_DISPOSITIONS)[number];

export const SECTION_APPLICABILITIES = ['required', 'derived', 'not_applicable'] as const;
export type SectionApplicability = (typeof SECTION_APPLICABILITIES)[number];

export const SECTION_ASSESSMENT_STATUSES = ['unassessed', 'in_progress', 'ready'] as const;
export type SectionAssessmentStatus = (typeof SECTION_ASSESSMENT_STATUSES)[number];

export const PROJECT_COMPLETION_STATUSES = [
	'unverified',
	'in_progress',
	'ready',
	'completed'
] as const;
export type ProjectCompletionStatus = (typeof PROJECT_COMPLETION_STATUSES)[number];

/** The verdict a completion assessment returns — see `assessProjectCompletion`. */
export const COMPLETION_VERDICTS = ['unverified', 'blocked', 'ready', 'completed'] as const;
export type CompletionVerdict = (typeof COMPLETION_VERDICTS)[number];

export const SCOPE_AUDIT_KINDS = ['audit', 'completion'] as const;
export type ScopeAuditKind = (typeof SCOPE_AUDIT_KINDS)[number];

/** How many audit runs the ledger keeps. Older runs fall off the end. */
export const SCOPE_AUDIT_LOG_LIMIT = 50;

export interface ScopeCapability {
	readonly id: string;
	name: string;
	description: string;
	sourceIds: string[];
	featureIds: string[];
	disposition: CapabilityDisposition;
	rationale: string;
	approvalId: string | null;
}

export interface ScopeSectionAssessment {
	section: string;
	applicability: SectionApplicability;
	status: SectionAssessmentStatus;
	rationale: string;
	approvalId: string | null;
}

export interface ScopeAudit {
	performedAt: string;
	scopeFingerprint: string;
	modelFingerprint: string;
}

/**
 * One recorded pass of the completion gate — the session list a reviewer reads.
 * Deliberately separate from `ScopeAudit`: that one is the CURRENT snapshot and
 * is dropped the moment the scope content changes, while these entries are
 * immutable history and must survive that invalidation.
 */
export interface ScopeAuditEntry extends ScopeAudit {
	kind: ScopeAuditKind;
	/** Who ran it: an authenticated email, or 'local' when auth is off. */
	actor: string;
	score: number;
	verdict: CompletionVerdict;
	blockingIssues: number;
	/** Check keys that failed at the time of the run — the "why" behind a verdict. */
	failedChecks: string[];
}

/** Newest first, capped. The only way an audit entry may enter the ledger. */
export function appendScopeAudit(
	log: readonly ScopeAuditEntry[],
	entry: ScopeAuditEntry
): ScopeAuditEntry[] {
	return [entry, ...log].slice(0, SCOPE_AUDIT_LOG_LIMIT);
}

const SECTION_LABELS: Readonly<Record<string, string>> = {
	foundation: 'Foundation',
	users: 'Users & Permissions',
	features: 'Features',
	experience: 'Experience',
	rules: 'Features · Rules & edge cases',
	data: 'Data & Architecture · Data model',
	architecture: 'Data & Architecture · Architecture',
	coherence: 'Project health',
	glossary: 'Glossary',
	supervision: 'Supervision',
	finops: 'Supervision · AI Cost Governor',
	approvals: 'Traceability · Approvals',
	baselines: 'Traceability · Baselines',
	documents: 'Documents & Sources'
};

export function scopeSectionLabel(section: string): string {
	return SECTION_LABELS[section] ?? section;
}

/**
 * The product-level coverage ledger. It records the declared authoring scope,
 * the external capabilities expected from that scope, and an explicit verdict
 * for every project section. Completion metadata is written only by dedicated
 * application use-cases; ordinary section saves preserve or invalidate it.
 */
export interface ProjectScopeDraft {
	projectId: string;
	mode: ScopeMode;
	capabilities: ScopeCapability[];
	sectionAssessments: ScopeSectionAssessment[];
	audit: ScopeAudit | null;
	/** Append-only history of gate runs. Server-owned: never written by a save. */
	auditLog: ScopeAuditEntry[];
	completionStatus: ProjectCompletionStatus;
	completedAt: string | null;
	lastSavedAt: string | null;
}

export function createEmptyScopeDraft(projectId: string): ProjectScopeDraft {
	return {
		projectId,
		mode: 'unclassified',
		capabilities: [],
		sectionAssessments: [],
		audit: null,
		auditLog: [],
		completionStatus: 'unverified',
		completedAt: null,
		lastSavedAt: null
	};
}

export function isScopeMode(value: unknown): value is ScopeMode {
	return typeof value === 'string' && (SCOPE_MODES as readonly string[]).includes(value);
}

export function isCapabilityDisposition(value: unknown): value is CapabilityDisposition {
	return (
		typeof value === 'string' &&
		(CAPABILITY_DISPOSITIONS as readonly string[]).includes(value)
	);
}

export function isSectionApplicability(value: unknown): value is SectionApplicability {
	return (
		typeof value === 'string' &&
		(SECTION_APPLICABILITIES as readonly string[]).includes(value)
	);
}

export function isCompletionVerdict(value: unknown): value is CompletionVerdict {
	return typeof value === 'string' && (COMPLETION_VERDICTS as readonly string[]).includes(value);
}

export function isScopeAuditKind(value: unknown): value is ScopeAuditKind {
	return typeof value === 'string' && (SCOPE_AUDIT_KINDS as readonly string[]).includes(value);
}

export function isSectionAssessmentStatus(value: unknown): value is SectionAssessmentStatus {
	return (
		typeof value === 'string' &&
		(SECTION_ASSESSMENT_STATUSES as readonly string[]).includes(value)
	);
}

export function createScopeCapability(
	id: string,
	overrides: Partial<ScopeCapability> = {}
): ScopeCapability {
	return {
		id,
		name: '',
		description: '',
		sourceIds: [],
		featureIds: [],
		disposition: 'unresolved',
		rationale: '',
		approvalId: null,
		...overrides
	};
}
