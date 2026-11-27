import {
	createEmptyScopeBoundary,
	createEmptyScopeDraft,
	isCapabilityDisposition,
	isCompletionVerdict,
	isScopeAuditKind,
	isScopeMode,
	isSectionApplicability,
	isSectionAssessmentStatus,
	SCOPE_AUDIT_LOG_LIMIT,
	type ProjectCompletionStatus,
	type ProjectScopeDraft,
	type ScopeApproval,
	type ScopeAuditEntry,
	type ScopeBoundary,
	type ScopeCapability,
	type ScopeSectionAssessment
} from '$domain/scope';
import { isAgentAuthorable, SECTIONS } from '$lib/shared/sections';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const int = (value: unknown, max: number): number =>
	typeof value === 'number' && Number.isFinite(value)
		? Math.min(Math.max(Math.round(value), 0), max)
		: 0;
const nullableStr = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null;
const stringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
		: [];

const completionStatuses: readonly ProjectCompletionStatus[] = [
	'unverified',
	'in_progress',
	'ready',
	'completed'
];
// Anti-corruption for stored scope rows: pre-fold section ids collapse to 'foundation'.
const LEGACY_FOUNDATION_SECTIONS = new Set(['initialization', 'framing', 'foundations']);
const STATUS_RANK = { unassessed: 0, in_progress: 1, ready: 2 } as const;

function canonicalSection(section: string): string {
	return LEGACY_FOUNDATION_SECTIONS.has(section) ? 'foundation' : section;
}

function mergeAssessment(
	current: ScopeSectionAssessment,
	incoming: ScopeSectionAssessment
): ScopeSectionAssessment {
	const status =
		STATUS_RANK[current.status] <= STATUS_RANK[incoming.status]
			? current.status
			: incoming.status;
	const rationales = [...new Set([current.rationale, incoming.rationale].filter(Boolean))];
	return {
		section: current.section,
		applicability:
			current.applicability === 'required' || incoming.applicability === 'required'
				? 'required'
				: current.applicability === 'derived' || incoming.applicability === 'derived'
					? 'derived'
					: 'not_applicable',
		status,
		rationale: rationales.join(' · ')
	};
}

/**
 * Where the specification stops (criterion 3a1f96bc). A group summary without
 * a name names nothing and is dropped; the first summary of a name wins.
 */
function parseBoundary(input: unknown): ScopeBoundary {
	if (!input || typeof input !== 'object') return createEmptyScopeBoundary();
	const src = input as Record<string, unknown>;
	const groups: ScopeBoundary['groups'] = [];
	const named = new Set<string>();
	for (const item of Array.isArray(src.groups) ? src.groups : []) {
		if (!item || typeof item !== 'object') continue;
		const value = item as Record<string, unknown>;
		const name = str(value.name).trim();
		if (!name || named.has(name)) continue;
		named.add(name);
		groups.push({ name, summary: str(value.summary).trim() });
	}
	return {
		covers: str(src.covers).trim(),
		decision: str(src.decision).trim(),
		decidedAt: nullableStr(src.decidedAt),
		groups,
		approval: parseApproval(src.approval)
	};
}

/**
 * The approval as stored. Read here so a stored one loads; a save never takes
 * it from what it is sent (SaveScopeDraftUseCase keeps the stored one), since
 * only a person gives it, through its own door (criterion d16b352d).
 */
function parseApproval(input: unknown): ScopeApproval | null {
	if (!input || typeof input !== 'object') return null;
	const src = input as Record<string, unknown>;
	const by = str(src.by).trim();
	const at = str(src.at).trim();
	const leftOut = str(src.leftOut).trim();
	return by && at && leftOut ? { by, at, leftOut } : null;
}

/** Anti-corruption parser for the product-level scope and completion ledger. */
export function parseScopeDraft(input: unknown, projectId: string): ProjectScopeDraft {
	const base = createEmptyScopeDraft(projectId);
	if (!input || typeof input !== 'object') return withCanonicalSections(base);
	const src = input as Record<string, unknown>;
	const capabilities: ScopeCapability[] = [];
	const capabilityIds = new Set<string>();

	if (Array.isArray(src.capabilities)) {
		for (const item of src.capabilities) {
			if (!item || typeof item !== 'object') continue;
			const value = item as Record<string, unknown>;
			const id = str(value.id);
			if (!id || capabilityIds.has(id)) continue;
			capabilityIds.add(id);
			capabilities.push({
				id,
				name: str(value.name),
				description: str(value.description),
				sourceIds: stringArray(value.sourceIds),
				featureIds: stringArray(value.featureIds),
				disposition: isCapabilityDisposition(value.disposition)
					? value.disposition
					: 'unresolved',
				rationale: str(value.rationale),
				// No approval is kept (criterion 3a1f96bc): one sent with a capability is dropped here.
				group: str(value.group).trim()
			});
		}
	}

	const sectionAssessments = new Map<string, ScopeSectionAssessment>();
	if (Array.isArray(src.sectionAssessments)) {
		for (const item of src.sectionAssessments) {
			if (!item || typeof item !== 'object') continue;
			const value = item as Record<string, unknown>;
			const section = canonicalSection(str(value.section));
			if (!section || section === 'scope') continue;
			const assessment: ScopeSectionAssessment = {
				section,
				applicability: isSectionApplicability(value.applicability)
					? value.applicability
					: 'required',
				status: isSectionAssessmentStatus(value.status) ? value.status : 'unassessed',
				rationale: str(value.rationale)
			};
			const current = sectionAssessments.get(section);
			sectionAssessments.set(
				section,
				current ? mergeAssessment(current, assessment) : assessment
			);
		}
	}

	const rawAudit =
		src.audit && typeof src.audit === 'object' ? (src.audit as Record<string, unknown>) : null;
	const audit =
		rawAudit &&
		str(rawAudit.performedAt) &&
		str(rawAudit.scopeFingerprint) &&
		str(rawAudit.modelFingerprint)
			? {
					performedAt: str(rawAudit.performedAt),
					scopeFingerprint: str(rawAudit.scopeFingerprint),
					modelFingerprint: str(rawAudit.modelFingerprint)
				}
			: null;
	// Pre-log ledgers simply carry no history; entries are only ever appended by
	// the audit/finish use-cases, so a malformed row is dropped rather than healed.
	const auditLog: ScopeAuditEntry[] = [];
	if (Array.isArray(src.auditLog)) {
		for (const item of src.auditLog) {
			if (!item || typeof item !== 'object') continue;
			const value = item as Record<string, unknown>;
			const performedAt = str(value.performedAt);
			if (!performedAt || auditLog.length >= SCOPE_AUDIT_LOG_LIMIT) continue;
			auditLog.push({
				performedAt,
				scopeFingerprint: str(value.scopeFingerprint),
				modelFingerprint: str(value.modelFingerprint),
				kind: isScopeAuditKind(value.kind) ? value.kind : 'audit',
				actor: str(value.actor) || 'unknown',
				score: int(value.score, 100),
				verdict: isCompletionVerdict(value.verdict) ? value.verdict : 'unverified',
				blockingIssues: int(value.blockingIssues, Number.MAX_SAFE_INTEGER),
				failedChecks: stringArray(value.failedChecks)
			});
		}
	}

	const completionStatus = completionStatuses.includes(
		src.completionStatus as ProjectCompletionStatus
	)
		? (src.completionStatus as ProjectCompletionStatus)
		: 'unverified';

	return withCanonicalSections({
		...base,
		projectId,
		mode: isScopeMode(src.mode) ? src.mode : 'unclassified',
		boundary: parseBoundary(src.boundary),
		capabilities,
		sectionAssessments: [...sectionAssessments.values()],
		audit,
		auditLog,
		completionStatus,
		completedAt: nullableStr(src.completedAt),
		lastSavedAt: nullableStr(src.lastSavedAt)
	});
}

function withCanonicalSections(draft: ProjectScopeDraft): ProjectScopeDraft {
	const bySection = new Map(
		draft.sectionAssessments.map((assessment) => [assessment.section, assessment])
	);
	return {
		...draft,
		// Only the product specification is the author's to assess. Computed
		// surfaces (Project health, Baselines) are seeded `derived`; the gate
		// never asks the author to manufacture their captured or computed content.
		sectionAssessments: SECTIONS.filter((section) => section !== 'scope').map(
			(section): ScopeSectionAssessment => {
				const seeded: ScopeSectionAssessment = {
					section,
					applicability: isAgentAuthorable(section) ? 'required' : 'derived',
					status: 'unassessed',
					rationale: ''
				};
				const stored = bySection.get(section);
				if (!stored) return seeded;
				// The registry is the authority on who owns a section, so a row
				// persisted as `required` for a section nobody may author is
				// normalized back to `derived` on load. Without this, a ledger
				// written before a section changed hands keeps blocking the gate
				// on a verdict nothing can give.
				return isAgentAuthorable(section) ? stored : { ...stored, applicability: 'derived' };
			}
		)
	};
}
