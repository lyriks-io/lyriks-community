import {
	scopeSectionLabel,
	type CompletionVerdict,
	type ProjectScopeDraft,
	type ScopeCapability
} from './draft';

export type CompletionIssueSeverity = 'blocking' | 'warning';

export interface CompletionIssue {
	code: string;
	severity: CompletionIssueSeverity;
	message: string;
	path: string;
}

export type CompletionCheckKey =
	| 'scope'
	| 'sources'
	| 'mapping'
	| 'sections'
	| 'coherence'
	| 'behavior'
	| 'data'
	| 'experience'
	| 'audit';

export interface CompletionCheck {
	key: CompletionCheckKey;
	label: string;
	passed: boolean;
	detail: string;
}

export interface ProjectCompletionReport {
	projectId: string;
	status: CompletionVerdict;
	score: number;
	canFinish: boolean;
	auditFresh: boolean;
	coverage: {
		totalCapabilities: number;
		includedCapabilities: number;
		resolvedCapabilities: number;
		assessedSections: number;
		totalSections: number;
	};
	checks: CompletionCheck[];
	issues: CompletionIssue[];
}

export interface CompletionEvidence {
	sourceIds: readonly string[];
	featureMaturity: Readonly<Record<string, number>>;
	/** One row per entity a leaf feature's behavior model declares: the entity
	 *  name as authored in the kernel, and the declaring feature's display name.
	 *  Drives the data-coverage check (nothing the behavior knows may silently
	 *  miss from the data model). */
	behaviorEntities: ReadonlyArray<{ name: string; featureName: string }>;
	/** Names of the entities currently authored in the data section. */
	dataEntityNames: readonly string[];
	/** Names of the data entities that take part in no relation: they point at
	 *  no other entity and no entity points at them. Optional so older evidence
	 *  readers keep compiling; absent reads as "none". */
	unrelatedDataEntityNames?: readonly string[];
	/** Registered sources a reader other than their author cannot consult: an
	 *  address nobody else can open (a file:// path, a plain reference), or a row
	 *  with neither a link nor a note. Each carries the sentence to report.
	 *  Optional for the same reason as above; absent reads as "none". */
	unreachableSources?: ReadonlyArray<{
		id: string;
		access: 'unreachable' | 'empty';
		message: string;
	}>;
	settledApprovalIds: readonly string[];
	coherenceReady: boolean;
	coherenceDetail: string;
	experienceReady: boolean;
	experienceDetail: string;
	currentScopeFingerprint: string;
	currentModelFingerprint: string;
	/**
	 * The engine could not finish every reading inside its budget, so this
	 * evidence stands on fewer signals than usual. The gate treats it like any
	 * other reading (a missing signal never blocks by itself); it is recorded so a
	 * caching tier can choose to keep such a reading only briefly.
	 */
	provisional?: boolean;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

function dataCheckDetail(uncovered: number, checked: number, unrelated: number): string {
	const parts = [
		uncovered === 0
			? `Every behavior entity is represented in the data model (${checked} checked)`
			: `${uncovered} behavior entit${uncovered === 1 ? 'y is' : 'ies are'} missing from the data model`
	];
	if (unrelated > 0) {
		parts.push(`${unrelated} entit${unrelated === 1 ? 'y takes' : 'ies take'} part in no relation`);
	}
	return parts.join('; ');
}

function sourcesCheckDetail(registered: number, unreachable: number): string {
	const base = `${registered} registered source${registered === 1 ? '' : 's'}`;
	return unreachable > 0
		? `${base}; ${unreachable} that nobody but ${unreachable === 1 ? 'its' : 'their'} author can consult`
		: base;
}

/**
 * Case-, punctuation- and naive-plural-insensitive identity for entity names,
 * so "Order lines" declared in behavior matches "OrderLine" in the data model.
 * Deliberately loose: this feeds a WARNING, and a false match is cheaper than
 * a gate that nags about spelling.
 */
function entityKey(name: string): string {
	const flat = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
	return flat.endsWith('s') ? flat.slice(0, -1) : flat;
}

function settled(capability: ScopeCapability, approvals: ReadonlySet<string>): boolean {
	return (
		capability.approvalId !== null &&
		approvals.has(capability.approvalId) &&
		capability.rationale.trim().length > 0
	);
}

/**
 * Deterministic project completion gate. It never infers external coverage from
 * the current feature tree: the persisted scope ledger is the reference set,
 * while the authored model only supplies evidence that each item is covered.
 */
export function assessProjectCompletion(
	draft: ProjectScopeDraft,
	evidence: CompletionEvidence
): ProjectCompletionReport {
	const issues: CompletionIssue[] = [];
	const sources = new Set(evidence.sourceIds);
	const approvals = new Set(evidence.settledApprovalIds);
	const maturity = evidence.featureMaturity;
	const capabilities = draft.capabilities;

	if (draft.mode === 'unclassified') {
		issues.push({
			code: 'scope-mode-unclassified',
			severity: 'blocking',
			message: 'Choose whether this project covers the full product, a selected scope, or a prototype.',
			path: 'mode'
		});
	}
	if (capabilities.length === 0) {
		issues.push({
			code: 'scope-empty',
			severity: 'blocking',
			message: 'Add the capabilities the product is expected to cover.',
			path: 'capabilities'
		});
	}

	for (const capability of capabilities) {
		const path = `capabilities.${capability.id}`;
		if (!capability.name.trim()) {
			issues.push({
				code: 'capability-name-missing',
				severity: 'blocking',
				message: 'A scope capability has no name.',
				path
			});
		}
		if (capability.disposition === 'unresolved') {
			issues.push({
				code: 'capability-unresolved',
				severity: 'blocking',
				message: `"${capability.name || 'Unnamed capability'}" has not been included, excluded, or deferred.`,
				path
			});
		}
		if (capability.sourceIds.length === 0) {
			issues.push({
				code: 'capability-source-missing',
				severity: 'blocking',
				message: `"${capability.name || 'Unnamed capability'}" is not tied to any source.`,
				path
			});
		} else {
			for (const sourceId of unique(capability.sourceIds)) {
				if (!sources.has(sourceId)) {
					issues.push({
						code: 'capability-source-unknown',
						severity: 'blocking',
						message: `"${capability.name || 'Unnamed capability'}" references a source that no longer exists.`,
						path
					});
				}
			}
		}

		if (capability.disposition === 'included') {
			if (capability.featureIds.length === 0) {
				issues.push({
					code: 'capability-feature-missing',
					severity: 'blocking',
					message: `"${capability.name || 'Unnamed capability'}" is included but not mapped to a leaf feature.`,
					path
				});
			}
			for (const featureId of unique(capability.featureIds)) {
				if (!(featureId in maturity)) {
					issues.push({
						code: 'capability-feature-unknown',
						severity: 'blocking',
						message: `"${capability.name || 'Unnamed capability'}" references a feature that no longer exists.`,
						path
					});
				} else if (maturity[featureId] <= 0) {
					issues.push({
						code: 'capability-behavior-missing',
						severity: 'blocking',
						message: `"${capability.name || 'Unnamed capability'}" maps to a feature with no authored behavior.`,
						path
					});
				}
			}
		}

		if (capability.disposition === 'excluded' || capability.disposition === 'deferred') {
			if (draft.mode === 'full_product') {
				issues.push({
					code: 'full-product-omission',
					severity: 'blocking',
					// Naming the way out matters here: the mode is usually chosen at the
					// very first call, long before the capability that needs deferring
					// exists, and the author who meets this blocker later has no reason
					// to suspect a decision made on day one is what is holding them.
					message:
						`"${capability.name || 'Unnamed capability'}" cannot be ${capability.disposition} in full-product mode. ` +
						`Either bring it into scope as "included", or switch the scope to "selected_scope", ` +
						`which allows it once it carries a rationale and a settled approval.`,
					path
				});
			} else if (!settled(capability, approvals)) {
				issues.push({
					code: 'capability-omission-unapproved',
					severity: 'blocking',
					message: `"${capability.name || 'Unnamed capability'}" needs a rationale and a settled approval before it can be ${capability.disposition}.`,
					path
				});
			}
		}
	}

	for (const assessment of draft.sectionAssessments) {
		const path = `sectionAssessments.${assessment.section}`;
		const sectionLabel = scopeSectionLabel(assessment.section);
		// A `derived` section is computed server-side or owned by the workspace
		// operator (Project health, Baselines, Supervision, AI Cost Governor). It
		// carries no product decision to sign off, so demanding a verdict on it only
		// pushed the author — and any agent — to assert something it cannot know.
		if (assessment.applicability === 'derived') continue;
		if (assessment.status !== 'ready') {
			issues.push({
				code: 'section-not-ready',
				severity: 'blocking',
				message: `${sectionLabel} has not been assessed as ready.`,
				path
			});
		}
		if (assessment.applicability === 'not_applicable') {
			const approved =
				assessment.approvalId !== null &&
				approvals.has(assessment.approvalId) &&
				assessment.rationale.trim().length > 0;
			if (draft.mode === 'full_product') {
				issues.push({
					code: 'full-product-section-omission',
					severity: 'blocking',
					message: `${sectionLabel} cannot be marked not applicable in full-product mode.`,
					path
				});
			} else if (!approved) {
				issues.push({
					code: 'section-omission-unapproved',
					severity: 'blocking',
					message: `${sectionLabel} needs a rationale and a settled approval to be not applicable.`,
					path
				});
			}
		}
	}

	if (!evidence.coherenceReady) {
		issues.push({
			code: 'coherence-not-ready',
			severity: 'blocking',
			message: evidence.coherenceDetail,
			path: 'coherence'
		});
	}
	if (!evidence.experienceReady) {
		issues.push({
			code: 'experience-not-ready',
			severity: 'blocking',
			message: evidence.experienceDetail,
			path: 'experience'
		});
	}

	// The data model must account for everything the behavior kernel knows.
	// Warning severity on purpose: name drift (a synonym, a rename in flight)
	// must not deadlock finish_project, but every uncovered entity stays on the
	// report until someone models it or records why it is excluded.
	const modeledEntities = new Set(evidence.dataEntityNames.map(entityKey));
	const uncoveredEntities = new Map<string, { name: string; features: Set<string> }>();
	for (const usage of evidence.behaviorEntities) {
		const key = entityKey(usage.name);
		if (!key || modeledEntities.has(key)) continue;
		const entry = uncoveredEntities.get(key) ?? { name: usage.name, features: new Set<string>() };
		if (usage.featureName.trim()) entry.features.add(usage.featureName.trim());
		uncoveredEntities.set(key, entry);
	}
	for (const { name, features } of uncoveredEntities.values()) {
		const usedBy = features.size > 0 ? ` (used by ${[...features].join(', ')})` : '';
		issues.push({
			code: 'behavior-entity-unmodeled',
			severity: 'warning',
			message: `The behavior model declares "${name}"${usedBy} but the data model has no such entity. Model it, or record why it is excluded.`,
			path: 'data.entities'
		});
	}
	// A table nobody points at and that points at nothing describes no record
	// of the product. Same severity as the coverage warning above, for the same
	// reason: it must be seen on every report, and it must not deadlock finish.
	const unrelatedEntities = unique(evidence.unrelatedDataEntityNames ?? []);
	for (const name of unrelatedEntities) {
		issues.push({
			code: 'data-entity-unrelated',
			severity: 'warning',
			message: `The data model holds "${name}" but it relates to nothing and nothing relates to it. Model its relation to what owns it or what it references, or record in its description why it stands alone.`,
			path: 'data.entities'
		});
	}
	// A source nobody but its author can open is a citation that cannot be
	// checked: the row looks sourced and is not. Warning severity like the two
	// above (it must not deadlock finish), but it fails the traceability check
	// and stays on every report until the row carries a web address or its content.
	const unreachableSources = evidence.unreachableSources ?? [];
	for (const source of unreachableSources) {
		issues.push({
			code: source.access === 'empty' ? 'source-empty' : 'source-unreachable',
			severity: 'warning',
			message: source.message,
			path: `documents.sources.${source.id}`
		});
	}
	const behaviorEntityCount = new Set(
		evidence.behaviorEntities.map((usage) => entityKey(usage.name)).filter(Boolean)
	).size;

	const auditFresh =
		draft.audit !== null &&
		draft.audit.scopeFingerprint === evidence.currentScopeFingerprint &&
		draft.audit.modelFingerprint === evidence.currentModelFingerprint;
	if (!auditFresh) {
		issues.push({
			code: 'audit-stale',
			severity: 'blocking',
			message: draft.audit
				? 'The project changed after its last coverage audit. Run the audit again.'
				: 'Run a coverage audit before completing the project.',
			path: 'audit'
		});
	}

	const blocking = issues.filter((issue) => issue.severity === 'blocking');
	const resolvedCapabilities = capabilities.filter(
		(capability) => capability.disposition !== 'unresolved'
	).length;
	// Derived rows are excluded from the coverage math too — counting sections
	// nobody may assess would cap a fully-authored project below 100%.
	const assessableSections = draft.sectionAssessments.filter(
		(assessment) => assessment.applicability !== 'derived'
	);
	const assessedSections = assessableSections.filter(
		(assessment) => assessment.status === 'ready'
	).length;
	const coverageUnits = capabilities.length + assessableSections.length + 3;
	const completedUnits =
		resolvedCapabilities +
		assessedSections +
		(evidence.coherenceReady ? 1 : 0) +
		(evidence.experienceReady ? 1 : 0) +
		(auditFresh ? 1 : 0);
	const score = coverageUnits === 0 ? 0 : Math.round((completedUnits / coverageUnits) * 100);
	const canFinish = blocking.length === 0;
	const stillCompleted = draft.completionStatus === 'completed' && canFinish;

	const checks: CompletionCheck[] = [
		{
			key: 'scope',
			label: 'Declared scope',
			passed:
				draft.mode !== 'unclassified' &&
				capabilities.length > 0 &&
				!issues.some((issue) =>
					[
						'scope-mode-unclassified',
						'scope-empty',
						'capability-name-missing',
						'capability-unresolved',
						'capability-omission-unapproved',
						'full-product-omission'
					].includes(issue.code)
				),
			detail: `${resolvedCapabilities}/${capabilities.length} capabilities resolved`
		},
		{
			key: 'sources',
			label: 'Source traceability',
			passed:
				!issues.some((issue) => issue.code.startsWith('capability-source')) &&
				unreachableSources.length === 0,
			detail: sourcesCheckDetail(sources.size, unreachableSources.length)
		},
		{
			key: 'mapping',
			label: 'Feature mapping',
			passed: !issues.some((issue) => issue.code.startsWith('capability-feature')),
			detail: 'Included capabilities map to current leaf features'
		},
		{
			key: 'sections',
			label: 'Section assessment',
			passed: !issues.some((issue) => issue.code.startsWith('section-') || issue.code.startsWith('full-product-section')),
			detail: `${assessedSections}/${assessableSections.length} sections ready`
		},
		{
			key: 'coherence',
			label: 'Project health',
			passed: evidence.coherenceReady,
			detail: evidence.coherenceDetail
		},
		{
			key: 'behavior',
			label: 'Behavior coverage',
			passed: !issues.some(
				(issue) =>
					issue.code === 'capability-behavior-missing' ||
					issue.code === 'capability-feature-unknown'
			),
			detail: 'Every mapped current feature has authored behavior'
		},
		{
			key: 'data',
			label: 'Data model coverage',
			passed: uncoveredEntities.size === 0 && unrelatedEntities.length === 0,
			detail: dataCheckDetail(uncoveredEntities.size, behaviorEntityCount, unrelatedEntities.length)
		},
		{
			key: 'experience',
			label: 'End-to-end experience',
			passed: evidence.experienceReady,
			detail: evidence.experienceDetail
		},
		{
			key: 'audit',
			label: 'Fresh audit',
			passed: auditFresh,
			detail: auditFresh ? `Audited ${draft.audit?.performedAt ?? ''}` : 'Audit required'
		}
	];

	return {
		projectId: draft.projectId,
		status: stillCompleted
			? 'completed'
			: canFinish
				? 'ready'
				: draft.audit
					? 'blocked'
					: 'unverified',
		score,
		canFinish,
		auditFresh,
		coverage: {
			totalCapabilities: capabilities.length,
			includedCapabilities: capabilities.filter((capability) => capability.disposition === 'included').length,
			resolvedCapabilities,
			assessedSections,
			totalSections: assessableSections.length
		},
		checks,
		issues
	};
}

function stableValue(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`)
		.join(',')}}`;
}

/** Small deterministic, non-cryptographic fingerprint for stale-audit detection. */
export function fingerprint(value: unknown): string {
	const input = stableValue(value);
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function scopeContentFingerprint(
	draft: ProjectScopeDraft,
	sources: readonly { id: string; title: string; kind: string; url: string; note: string }[] = []
): string {
	const referenced = new Set(draft.capabilities.flatMap((capability) => capability.sourceIds));
	return fingerprint({
		mode: draft.mode,
		capabilities: draft.capabilities,
		sectionAssessments: draft.sectionAssessments,
		sources: sources
			.filter((source) => referenced.has(source.id))
			.slice()
			.sort((a, b) => a.id.localeCompare(b.id))
	});
}
