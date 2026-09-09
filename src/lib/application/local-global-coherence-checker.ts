import {
	computeReadiness,
	LOCAL_CHECK_IDS,
	MATURITY_DIMENSION_KEY,
	type CoherenceAnalysis,
	type Dimension,
	type Gap,
	type GapKind,
	type GapSeverity
} from '$domain/coherence';
import { computeIdentityCoherence, type FoundationIdentityDraft } from '$domain/foundation';
import { computeDefinitionCoherence, type FoundationDefinitionDraft } from '$domain/foundation';
import {
	computeOperationsCoherence,
	type FoundationOperationsDraft
} from '$domain/foundation';
import {
	computeUsersCoherence,
	permissionCoverage,
	type ProjectUsersDraft
} from '$domain/users';
import { computeFeaturesCoherence, leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import {
	analyzeCoverage,
	computeExperienceCoherence,
	detectStateTypeConflicts,
	focusAnchor,
	type CoverageGap,
	type ProjectExperienceDraft
} from '$domain/experience';
import { derivedCapabilityIds } from './derived-capability-ids';
import { featureSurfaceCapabilities, type LeafSnapshot } from './projection/surface-capabilities';
import {
	computeRulesCoherence,
	ISSUE_KINDS,
	openCriticalContradictions,
	SETTLED_STATUSES,
	type IssueKind,
	type IssueSeverity,
	type ProjectRulesDraft
} from '$domain/rules';
import { computeDataCoherence, type ProjectDataDraft } from '$domain/data';
import { computeArchitectureCoherence, type ProjectArchitectureDraft } from '$domain/architecture';
import { computeGlossaryCoherence, type ProjectGlossaryDraft } from '$domain/glossary';
import type {
	BehaviorRepositoryPort,
	FeatureMaturityScorerPort,
	GlobalCoherenceCheckerPort
} from './ports';
import { mapLimit } from '$lib/shared/map-limit';

/**
 * Bound the per-feature kernel reads that back the maturity dimension. Without
 * this, a project with many leaves fans out one `loadFeature` per leaf at once;
 * multiplied across every project on the dashboard it thrashes the appliance box.
 */
const MATURITY_LEAF_CONCURRENCY = 6;
import type {
	LoadArchitectureDraftUseCase,
	LoadDataDraftUseCase,
	LoadExperienceDraftUseCase,
	LoadFeaturesDraftUseCase,
	LoadFoundationDraftUseCase,
	LoadGlossaryDraftUseCase,
	LoadRulesDraftUseCase,
	LoadUsersDraftUseCase
} from './use-cases';

/**
 * The LOCAL global-coherence checker: aggregates every earlier step's own
 * local-coherence into per-dimension scores, rolls them into one readiness
 * score, and detects the gaps that block a clean generation with deterministic
 * heuristics. Implements `GlobalCoherenceCheckerPort` — the future Rust DPO
 * `GrpcGlobalCoherenceChecker` implements the same port and swaps in here.
 */
export class LocalGlobalCoherenceChecker implements GlobalCoherenceCheckerPort {
	constructor(
		private readonly loadFoundation: LoadFoundationDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadRules: LoadRulesDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase,
		private readonly loadArchitecture: LoadArchitectureDraftUseCase,
		private readonly loadGlossary: LoadGlossaryDraftUseCase,
		private readonly behavior: BehaviorRepositoryPort,
		private readonly maturityScorer: FeatureMaturityScorerPort
	) {}

	async analyze(projectId: string): Promise<CoherenceAnalysis> {
		const [identity, definition, operations, users, features, experience, rules, data, architecture, glossary] =
			await Promise.all([
				this.loadFoundation.loadIdentity(projectId),
				this.loadFoundation.loadDefinition(projectId),
				this.loadFoundation.loadOperations(projectId),
				this.loadUsers.execute(projectId),
				this.loadFeatures.execute(projectId),
				this.loadExperience.execute(projectId),
				this.loadRules.execute(projectId),
				this.loadData.execute(projectId),
				this.loadArchitecture.execute(projectId),
				this.loadGlossary.execute(projectId)
			]);

		// ── Leaf kernel snapshots — read ONCE ──
		// They back two readings: behavioral maturity (below) and the surface rows
		// of the permission matrix. Loading them here keeps both on a single bounded
		// fan-out; a second pass would double the per-project IO on the dashboard.
		const leaves = leafFeatures(features);
		const leafSnapshots: LeafSnapshot[] =
			leaves.length > 0
				? await mapLimit(leaves, MATURITY_LEAF_CONCURRENCY, async (leaf) => ({
						id: leaf.id,
						name: leaf.name,
						snapshot: await this.behavior.loadFeature(projectId, leaf.id)
					}))
				: [];
		const kernelSurfaceIds = featureSurfaceCapabilities(leafSnapshots).map((c) => c.id);

		// Experience plan-coverage (the simulator as the heart of the product plan) —
		// read ONCE: its readiness feeds the coverage dimensions and its findings the
		// gap list, so the Control Center is the single home of the reading.
		const planCoverage = analyzeCoverage(experience, {
			roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
			entityNames: data.entities.map((e) => e.name)
		});

		const dimensions = buildDimensions(
			identity,
			definition,
			operations,
			users,
			features,
			experience,
			rules,
			data,
			architecture,
			glossary,
			kernelSurfaceIds,
			planCoverage.readinessScore
		);
		const gaps = detectGaps(
			users,
			features,
			experience,
			rules,
			data,
			architecture,
			glossary,
			kernelSurfaceIds,
			leafSnapshots
		);

		// Experience plan-coverage findings (the simulator's gaps) fold into the SAME
		// gap list — so coherence is computed identically everywhere (portfolio,
		// coherence page, sidebar, Control Center) from one source, with no drift.
		for (const g of planCoverage.gaps) {
			const plan = planCoverageCheck(g.id);
			const subject = quotedSubject(g.title);
			gaps.push({
				id: `exp-${g.id}`,
				checkId: plan.checkId,
				kind: plan.kind,
				kindLabel: plan.kindLabel,
				provenance: 'detected',
				...(subject ? { subject } : {}),
				severity: COVERAGE_SEVERITY[g.severity],
				title: g.title,
				detail: g.detail,
				// The plan-coverage detail is already the instruction.
				action: g.detail,
				sourceStep: 'experience',
				blocking: g.severity === 'blocking'
			});
		}

		// State-type conflicts — the authoring cause of a formal TYPE_COMPAT. We know
		// the exact screen + field, so the gap deep-links "Fix now" straight there.
		for (const c of detectStateTypeConflicts(experience)) {
			const first = c.entries[0];
			const other = c.entries.find((e) => e.type !== first.type) ?? first;
			gaps.push({
				id: `exp-statetype-${c.path.replace(/[^a-z0-9]+/gi, '-')}`,
				checkId: 'experience.state-types',
				kind: 'misalignment',
				kindLabel: 'Type conflict',
				provenance: 'detected',
				subject: c.path,
				severity: 'high',
				title: `"${c.path}" cannot be both ${c.types.join(' and ')}`,
				detail: `"${first.fieldLabel}" (${first.type}) on ${first.screenLabel} and "${other.fieldLabel}" (${other.type}) on ${other.screenLabel} bind the same state, a type incompatibility the formal engine flags.`,
				action: 'Make both inputs the same type, or bind them to different states.',
				sourceStep: 'experience',
				blocking: true,
				fixAnchor: focusAnchor(other.screenId, other.nodeId)
			});
		}

		// ── Behavioral maturity — the buildability signal ──
		// Score each leaf's authored Unspaghettit shell; an empty shell scores ~0.
		const featureMaturity: Record<string, number> = {};
		const scores = leafSnapshots.map((leaf) => this.maturityScorer.score(leaf.snapshot));
		for (const [index, leaf] of leaves.entries()) featureMaturity[leaf.id] = scores[index] ?? 0;
		const maturityScore =
			scores.length > 0
				? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
				: 0;
		const maturedCount = scores.filter((score) => score > 0).length;
		dimensions.push({
			key: MATURITY_DIMENSION_KEY,
			label: 'Behavior maturity',
			sourceStep: 'features',
			score: maturityScore,
			summary:
				leaves.length > 0
					? `${maturedCount}/${leaves.length} feature(s) with authored behavior · avg ${maturityScore}%`
					: 'No leaf feature exists, so behavior maturity is 0%'
		});
		if (leaves.length === 0) {
			gaps.push({
				id: 'gap-features-missing-leaf',
				checkId: 'features.has-leaf',
				kind: 'missing',
				kindLabel: 'No feature',
				provenance: 'detected',
				severity: 'high',
				title: 'Nothing to build yet: the product has no feature',
				detail: 'Nothing can be simulated, granted or built until the product has at least one feature.',
				action:
					'Create at least one leaf feature, assign it to the MVP, then author its surfaces, actions, states and scenarios.',
				sourceStep: 'features',
				blocking: true
			});
		} else if (maturityScore < 50) {
			gaps.push({
				id: 'gap-features-immature',
				checkId: 'features.maturity',
				kind: 'missing',
				kindLabel: 'Behavior not authored',
				provenance: 'detected',
				severity: 'high',
				title:
					leaves.length - maturedCount > 0
						? `${leaves.length - maturedCount} of ${count(leaves.length, 'feature')} still have no behavior`
						: `Behavior is only ${maturityScore}% authored across ${count(leaves.length, 'feature')}`,
				detail: 'Below half maturity, most features are still names: no surfaces, actions, states or scenarios to build from.',
				action: 'Complete the missing surfaces, actions, states and scenarios inside each leaf feature.',
				sourceStep: 'features',
				blocking: false
			});
		}

		// The freshest save across every section — ISO timestamps sort chronologically.
		const lastActivityAt =
			[identity, definition, operations, users, features, experience, rules, data, architecture, glossary]
				.map((d) => d.lastSavedAt)
				.filter((t): t is string => typeof t === 'string' && t.length > 0)
				.sort()
				.pop() ?? null;

		const readinessScore = computeReadiness(dimensions);
		return {
			dimensions,
			gaps,
			readinessScore,
			lastActivityAt,
			featureMaturity,
			checksRun: [...LOCAL_CHECK_IDS]
		};
	}
}

/** "1 feature" / "3 features": counts the way a reader says them. */
function count(n: number, singular: string, plural = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : plural}`;
}

/** Experience plan-coverage severity → coherence gap severity. */
const COVERAGE_SEVERITY: Record<CoverageGap['severity'], GapSeverity> = {
	blocking: 'high',
	warning: 'medium',
	info: 'low'
};

/** Step-06 issue severity → coherence gap severity. */
const ISSUE_GAP_SEVERITY: Record<IssueSeverity, GapSeverity> = {
	critical: 'high',
	major: 'medium',
	minor: 'low'
};

/**
 * Keyword embedded in the gap id so `inferKind` lands each Step-06 issue kind
 * in the matching incoherence bucket (contradictions/ambiguities fall through
 * to `misalignment`, the default).
 */
const ISSUE_KIND_HINT: Record<IssueKind, string> = {
	contradiction: 'conflict',
	ambiguity: 'ambiguity',
	missing_rule: 'missing',
	unhandled_edge: 'missing',
	overlap: 'duplicate',
	dead_rule: 'orphan',
	unreachable_state: 'orphan'
};

/** The coarse incoherence group each declared issue kind lands in (explicit, no keyword inference). */
const ISSUE_GAP_KIND: Record<IssueKind, GapKind> = {
	contradiction: 'misalignment',
	ambiguity: 'misalignment',
	missing_rule: 'missing',
	unhandled_edge: 'missing',
	overlap: 'duplicate',
	dead_rule: 'orphan',
	unreachable_state: 'orphan'
};

/**
 * What to do about a declared issue, derived from its kind so the card always
 * carries a verb even when the author only wrote the question.
 */
const ISSUE_ACTION: Record<IssueKind, string> = {
	contradiction: 'Keep one rule and retire or rewrite the other.',
	ambiguity: 'Define the term, then pin the rule to that definition.',
	missing_rule: 'Decide the rule and add it to the inventory.',
	unhandled_edge: 'Write the edge-case scenario that covers it.',
	overlap: 'Merge the two rules into one.',
	dead_rule: 'Remove the rule, or make its condition reachable.',
	unreachable_state: 'Add the transition that reaches the state, or remove the state.'
};

/** The plan-coverage detector behind an `exp-*` gap id, with its reader-facing class. */
function planCoverageCheck(coverageGapId: string): {
	checkId: string;
	kind: GapKind;
	kindLabel: string;
} {
	if (coverageGapId === 'entry-missing')
		return { checkId: 'experience.plan.entry', kind: 'missing', kindLabel: 'No entry screen' };
	if (coverageGapId.startsWith('screen-empty-'))
		return { checkId: 'experience.plan.screen-empty', kind: 'missing', kindLabel: 'Empty screen' };
	if (coverageGapId.startsWith('journey-unlinked-'))
		return {
			checkId: 'experience.plan.journey-unlinked',
			kind: 'step-without-action',
			kindLabel: 'Journey without a screen'
		};
	if (coverageGapId.startsWith('core-uncovered-'))
		return { checkId: 'experience.plan.core-uncovered', kind: 'orphan', kindLabel: 'Core without a screen' };
	if (coverageGapId.startsWith('role-unused-'))
		return { checkId: 'experience.plan.role-unused', kind: 'orphan', kindLabel: 'Role without a journey' };
	if (coverageGapId.startsWith('entity-unused-'))
		return { checkId: 'experience.plan.entity-unused', kind: 'orphan', kindLabel: 'Unused entity' };
	if (coverageGapId.startsWith('dead-action-'))
		return { checkId: 'experience.plan.dead-action', kind: 'step-without-action', kindLabel: 'Dead action' };
	if (coverageGapId.startsWith('nav-broken-'))
		return { checkId: 'experience.plan.nav-broken', kind: 'dangling', kindLabel: 'Broken navigation' };
	if (coverageGapId.startsWith('orphan-'))
		return { checkId: 'experience.plan.orphan-screen', kind: 'orphan', kindLabel: 'Unreachable screen' };
	return { checkId: 'experience.plan.screen-empty', kind: 'missing', kindLabel: 'Plan coverage' };
}

/** The first quoted name in a detector title ("Checkout" is empty), the element the gap is about. */
function quotedSubject(title: string): string | undefined {
	const m = /"([^"]+)"/.exec(title);
	return m?.[1]?.trim() || undefined;
}

function buildDimensions(
	identity: FoundationIdentityDraft,
	definition: FoundationDefinitionDraft,
	operations: FoundationOperationsDraft,
	users: ProjectUsersDraft,
	features: ProjectFeaturesDraft,
	experience: ProjectExperienceDraft,
	rules: ProjectRulesDraft,
	data: ProjectDataDraft,
	architecture: ProjectArchitectureDraft,
	glossary: ProjectGlossaryDraft,
	kernelSurfaceIds: readonly string[],
	planCoverageScore: number
): Dimension[] {
	const leaves = leafFeatures(features).length;
	const foundation = Math.round(
		(computeIdentityCoherence(identity).score +
			computeDefinitionCoherence(definition).score +
			computeOperationsCoherence(operations, identity.sourceMode !== 'greenfield').score) /
			3
	);
	const openCritical = openCriticalContradictions(rules).length;
	const placedEntities = data.entities.filter((e) => e.databaseId).length;
	const referencedTech = architecture.techChoices.filter((t) => t.referenceDocId).length;
	const glossaryTerms = glossary.terms.filter((t) => t.term.trim());
	const approvedTerms = glossaryTerms.filter((t) => t.status === 'approved').length;

	return [
		{
			key: 'foundation',
			label: 'Foundation',
			sourceStep: 'foundation',
			score: foundation,
			summary: `${definition.businessObjective.successCriteria.length} success criterion(a) · ${operations.testFixtures.length} fixture(s)`
		},
		{
			key: 'features',
			label: 'Features',
			sourceStep: 'features',
			score: computeFeaturesCoherence(features).score,
			summary: `${leaves} leaf feature(s) · ${features.mvpAssignments.length} MVP assignment(s)`
		},
		{
			key: 'users',
			label: 'Users',
			sourceStep: 'users',
			score: computeUsersCoherence(
				users,
				derivedCapabilityIds(features, experience, kernelSurfaceIds)
			).score,
			summary: `${users.roles.length} role(s) · ${users.permissions.length} grant(s)`
		},
		{
			key: 'experience',
			label: 'Experience',
			sourceStep: 'experience',
			score: computeExperienceCoherence(experience).score,
			summary: `${experience.journeys.length} journey(s) · ${experience.steps.length} step(s)`
		},
		{
			// The simulator's plan-coverage readiness (every journey on a screen,
			// every feature prototyped, no dead actions). Lives in the Control
			// Center's coverage panel — it merges into the Experience row there.
			key: 'experience-plan',
			label: 'Plan coverage',
			sourceStep: 'experience',
			score: planCoverageScore,
			summary: `${experience.screens.length} screen(s) · plan ${planCoverageScore}% runnable`
		},
		{
			key: 'rules',
			label: 'Rules',
			sourceStep: 'rules',
			score: computeRulesCoherence(rules).score,
			summary: `${rules.issues.length} issue(s) · ${openCritical} blocking`
		},
		{
			key: 'data',
			label: 'Data',
			sourceStep: 'data',
			score: computeDataCoherence(data).score,
			summary: `${data.entities.length} entit(ies) · ${placedEntities} placed`
		},
		{
			key: 'architecture',
			label: 'Architecture',
			sourceStep: 'architecture',
			score: computeArchitectureCoherence(architecture).score,
			summary: `${architecture.techChoices.length} tech · ${referencedTech} referenced · ${architecture.constraints.length} constraint(s)`
		},
		{
			// The governed vocabulary is product content like any other section — its
			// local score reports here so an ungoverned language shows in the Control
			// Center instead of only on the Glossary page (honest 0 when empty).
			key: 'glossary',
			label: 'Glossary',
			sourceStep: 'glossary',
			score: computeGlossaryCoherence(glossary).score,
			summary: `${glossaryTerms.length} term(s) · ${approvedTerms} approved`
		}
	];
}

function detectGaps(
	users: ProjectUsersDraft,
	features: ProjectFeaturesDraft,
	experience: ProjectExperienceDraft,
	rules: ProjectRulesDraft,
	data: ProjectDataDraft,
	architecture: ProjectArchitectureDraft,
	glossary: ProjectGlossaryDraft,
	kernelSurfaceIds: readonly string[],
	leafSnapshots: readonly LeafSnapshot[]
): Gap[] {
	const gaps: Gap[] = [];

	const missingSnapshots = leafSnapshots.filter((leaf) => leaf.snapshot === null);
	if (missingSnapshots.length > 0) {
		const missingNames = missingSnapshots.map((leaf) => leaf.name || leaf.id);
		gaps.push({
			id: 'gap-features-missing-kernel-snapshots',
			checkId: 'features.kernel-record',
			kind: 'dangling',
			kindLabel: 'Behavior record missing',
			provenance: 'detected',
			subject: missingNames.join(', '),
			severity: 'high',
			title: `${count(missingSnapshots.length, 'feature')} ${missingSnapshots.length === 1 ? 'has' : 'have'} no behavior record to build from`,
			detail: `The feature tree names ${missingNames.join(', ')}, but the behavior store has no record for them.`,
			action: 'Restore or re-author the behavior of each feature named.',
			sourceStep: 'features',
			blocking: true
		});
	}

	// Step-06 issues (contradictions, gaps, ambiguities over the declared rules) —
	// one gap per OPEN issue, so they surface in the Control Center's coherence
	// panel. The Rules & edge cases tab itself only authors rules and edge-case
	// scenarios; this list is the single home of the issues.
	const kindLabel = new Map<IssueKind, string>(ISSUE_KINDS.map((k) => [k.code, k.label]));
	const featureName = new Map(leafFeatures(features).map((f) => [f.id, f.name || '<unnamed feature>']));
	for (const issue of rules.issues) {
		if (SETTLED_STATUSES.includes(issue.status)) continue;
		const gapKind = issue.kind === 'missing_rule' || issue.kind === 'unhandled_edge';
		const subject = issue.relatedFeatureId ? featureName.get(issue.relatedFeatureId) : undefined;
		gaps.push({
			// The hint word in the id is kept for stable ids (acknowledgements and
			// decisions reference it); the group itself is explicit below.
			id: `gap-rules-issue-${ISSUE_KIND_HINT[issue.kind]}-${issue.id}`,
			checkId: 'rules.open-issues',
			kind: ISSUE_GAP_KIND[issue.kind],
			kindLabel: kindLabel.get(issue.kind) ?? 'Issue',
			// A hand-written issue is a decision to settle, not a detector's finding;
			// only the automatic scan's issues are detections.
			provenance: issue.autoDetected ? 'detected' : 'declared',
			...(subject ? { subject } : {}),
			severity: ISSUE_GAP_SEVERITY[issue.severity],
			title: issue.title.trim() || `${kindLabel.get(issue.kind) ?? 'Issue'} in the declared rules`,
			detail:
				issue.detail.trim() ||
				'Flagged across the declared rules: fix the rules it concerns, or cover it with an edge-case scenario.',
			// An issue parked in review already carries a recorded decision: the next
			// step is to settle it, not to author more.
			action:
				issue.status === 'in_review'
					? 'Review the decision recorded in its detail, then resolve it or accept the risk.'
					: ISSUE_ACTION[issue.kind],
			sourceStep: 'rules',
			// Same gate as before: a critical contradiction blocks the push.
			blocking: issue.kind === 'contradiction' && issue.severity === 'critical',
			// Gaps are covered by authoring an edge-case scenario; the rest are fixed
			// on the rule inventory.
			fixAnchor: gapKind ? '&rtab=edge_cases' : '&rtab=inventory',
			featureRef: issue.relatedFeatureId ?? undefined
		});
	}

	// Permission matrix coverage (Step 03) — the same metric the Users score
	// weighs heaviest, so the card and the dimension agree. The matrix's purpose
	// is that every feature is reachable by someone, so the headline gap is a
	// FEATURE with no user right (named); ungranted system/journey caps and roles
	// with no access at all are secondary clauses. Not the unreachable "every
	// role holds every capability" of cell density.
	const coverage = permissionCoverage(
		users,
		derivedCapabilityIds(features, experience, kernelSurfaceIds)
	);
	const uncoveredFeatures = coverage.uncoveredCapabilityIds.filter((id) => featureName.has(id));
	const uncoveredOther = coverage.uncoveredCapabilityIds.length - uncoveredFeatures.length;
	const orphanRoles = coverage.uncoveredRoleIds.length;
	if (uncoveredFeatures.length > 0 || uncoveredOther > 0 || orphanRoles > 0) {
		const parts: string[] = [];
		if (uncoveredFeatures.length > 0)
			parts.push(
				`${uncoveredFeatures.length} feature${uncoveredFeatures.length === 1 ? '' : 's'} with no user right`
			);
		if (uncoveredOther > 0)
			parts.push(`${uncoveredOther} other capabilit${uncoveredOther === 1 ? 'y' : 'ies'} ungranted`);
		if (orphanRoles > 0)
			parts.push(`${orphanRoles} role${orphanRoles === 1 ? '' : 's'} with no access`);
		const named = uncoveredFeatures.map((id) => featureName.get(id)).join(', ');
		// Subject first: ONE unreachable feature is named in the title, several are
		// counted there and named in the subject; the other clauses trail.
		const title =
			uncoveredFeatures.length === 1
				? `${named} has no user right${parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : ''}`
				: uncoveredFeatures.length > 1
					? `${uncoveredFeatures.length} features have no user right${parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : ''}`
					: orphanRoles > 0 && uncoveredOther === 0
					? `${count(orphanRoles, 'role')} can do nothing yet`
					: `${count(uncoveredOther, 'capability is', 'capabilities are')} granted to nobody${orphanRoles > 0 ? ` (${parts.slice(1).join(', ')})` : ''}`;
		gaps.push({
			id: 'gap-users-coverage',
			checkId: 'users.feature-reachable',
			kind: 'missing',
			kindLabel: uncoveredFeatures.length > 0 ? 'Feature with no user right' : orphanRoles > 0 ? 'Role with no access' : 'Ungranted capability',
			provenance: 'detected',
			...(named ? { subject: named } : {}),
			// A feature nobody can use is the real failure; weight it hardest.
			severity: uncoveredFeatures.length > 0 ? 'high' : 'medium',
			title,
			detail: uncoveredFeatures.length
				? `Nobody can reach ${named}: no role in the access matrix holds a right on it, so the feature is unreachable in the product.`
				: 'Every capability should be granted to at least one role, and every role should hold at least one capability.',
			action: uncoveredFeatures.length
				? `Grant ${uncoveredFeatures.length === 1 ? 'it' : 'each of them'} to at least one role in the access matrix.`
				: 'Grant every capability to at least one role, and give every role at least one capability.',
			sourceStep: 'users',
			blocking: false
		});
	}

	// Forgotten tables (Step 07): entities referenced by journeys but not modeled.
	const haveEntities = new Set(data.entities.map((e) => e.name.trim().toLowerCase()));
	const forgotten = data.derivedEntities.filter(
		(d) => !haveEntities.has(d.name.trim().toLowerCase())
	).length;
	if (forgotten > 0) {
		gaps.push({
			id: 'gap-data-forgotten',
			checkId: 'data.tables-modeled',
			kind: 'missing',
			kindLabel: 'Table without a schema',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(forgotten, 'table')} used by journeys ${forgotten === 1 ? 'needs' : 'need'} a schema`,
			detail: 'A journey reads or writes a table the data model never declares.',
			action: 'Derive the missing tables in Data & flows.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// Glossary governance — a STARTED vocabulary that is not locked down is a
	// language incoherence (a term everyone reads differently), so its two quality
	// issues surface here; an empty glossary only reads as the dimension's 0.
	const glossaryTerms = glossary.terms.filter((t) => t.term.trim());
	const undefinedTerms = glossaryTerms.filter((t) => !t.definition.trim()).length;
	if (undefinedTerms > 0) {
		gaps.push({
			id: 'gap-glossary-undefined-terms',
			checkId: 'glossary.defined',
			kind: 'missing',
			kindLabel: 'Term without a definition',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(undefinedTerms, 'governed term')} ${undefinedTerms === 1 ? 'needs' : 'need'} a definition`,
			detail: 'A term without a definition governs nothing: everyone keeps reading it their own way.',
			action: 'Write what each term canonically means in Glossary.',
			sourceStep: 'glossary',
			blocking: false
		});
	}
	const unapprovedTerms = glossaryTerms.filter((t) => t.status !== 'approved').length;
	if (unapprovedTerms > 0) {
		gaps.push({
			id: 'gap-glossary-unapproved-terms',
			checkId: 'glossary.approved',
			kind: 'missing',
			kindLabel: 'Term in draft',
			provenance: 'detected',
			severity: 'low',
			title: `${count(unapprovedTerms, 'term')} ${unapprovedTerms === 1 ? 'is' : 'are'} waiting for approval`,
			detail: 'A term in draft is not yet the product language; it can still change under everyone.',
			action: 'Approve the terms in Glossary to lock the product language.',
			sourceStep: 'glossary',
			blocking: false
		});
	}

	// Unreferenced tech (Step 08).
	const unreferenced = architecture.techChoices.filter((t) => !t.referenceDocId).length;
	if (unreferenced > 0) {
		gaps.push({
			id: 'gap-architecture-refs',
			checkId: 'architecture.references',
			kind: 'dangling',
			kindLabel: 'Tech choice without a reference',
			provenance: 'detected',
			severity: 'low',
			title: `${count(unreferenced, 'tech choice')} ${unreferenced === 1 ? 'needs' : 'need'} an official reference`,
			detail: 'A tech choice without its official reference leaves agents to guess the version and the API.',
			action: 'Attach a reference doc to each tech choice.',
			sourceStep: 'architecture',
			blocking: false
		});
	}

	// Thin experience (Step 05).
	if (experience.journeys.length === 0 && leafCount(features) > 0) {
		gaps.push({
			id: 'gap-experience-empty',
			checkId: 'experience.has-journey',
			kind: 'missing',
			kindLabel: 'No journey',
			provenance: 'detected',
			severity: 'medium',
			title: 'No journey shows how the product is used yet',
			detail: 'Features exist, but nothing says how a user walks through them.',
			action: 'Author at least one journey in Experience.',
			sourceStep: 'experience',
			blocking: false
		});
	}

	// ORPHAN — roles defined but granted nothing (Users × Permissions).
	if (users.roles.length > 0 && users.permissions.length === 0) {
		gaps.push({
			id: 'gap-users-orphan-roles',
			checkId: 'users.roles-granted',
			kind: 'orphan',
			kindLabel: 'Role with no capability',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(users.roles.length, 'role')} can do nothing yet`,
			detail: 'A role granted nothing does nothing in the product.',
			action: 'Grant at least one capability per role in the access matrix.',
			sourceStep: 'users',
			blocking: false
		});
	}

	// DUPLICATE — two entities sharing a normalized name (ambiguous schema).
	const entityNames = data.entities
		.map((e) => e.name.trim().toLowerCase())
		.filter((n) => n.length > 0);
	const duplicateEntities = entityNames.length - new Set(entityNames).size;
	if (duplicateEntities > 0) {
		gaps.push({
			id: 'gap-data-duplicate-entities',
			checkId: 'data.entities-unique',
			kind: 'duplicate',
			kindLabel: 'Duplicate entity name',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(duplicateEntities, 'entity name is', 'entity names are')} used twice`,
			detail: 'Two or more entities share a name, which makes the schema ambiguous.',
			action: 'Merge or rename the entities so each name is unique.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ORPHAN — entities modeled but not placed on any database (no home).
	const unplaced = data.entities.filter((e) => !e.databaseId).length;
	if (unplaced > 0) {
		gaps.push({
			id: 'gap-data-orphan-entities',
			checkId: 'data.entities-placed',
			kind: 'orphan',
			kindLabel: 'Entity without a database',
			provenance: 'detected',
			severity: 'low',
			title: `${count(unplaced, 'entity has', 'entities have')} no database to live on`,
			detail: 'An entity with no host database has nowhere to live once the product is built.',
			action: 'Place each entity on a host database in Infrastructure & Data.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// CROSS-CAPABILITY coherence — the whole product is a web of references that
	// must agree, not just features. These catch breaks BETWEEN capabilities.
	// ─────────────────────────────────────────────────────────────────────────

	const roleIds = new Set(users.roles.map((r) => r.id));

	// DANGLING (Experience → Users): a journey performs as a role that no longer exists.
	const danglingActors = experience.journeys.reduce(
		(n, jrn) => n + jrn.actorRoleIds.filter((id) => !roleIds.has(id)).length,
		0
	);
	if (danglingActors > 0) {
		gaps.push({
			id: 'gap-experience-dangling-role',
			checkId: 'experience.actors-resolve',
			kind: 'dangling',
			kindLabel: 'Actor role deleted',
			provenance: 'detected',
			severity: 'high',
			title: `${count(danglingActors, 'journey is', 'journeys are')} performed by a role that no longer exists`,
			detail: 'A journey is performed by a role that no longer exists in Users.',
			action: 'Re-point the journey to an existing role, or restore the role.',
			sourceStep: 'experience',
			blocking: false
		});
	}

	// DANGLING (Permissions → Users): a grant references a role that no longer exists.
	const danglingGrants = users.permissions.filter((g) => !roleIds.has(g.roleId)).length;
	if (danglingGrants > 0) {
		gaps.push({
			id: 'gap-permissions-dangling-role',
			checkId: 'users.grants-resolve',
			kind: 'dangling',
			kindLabel: 'Grant to a deleted role',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(danglingGrants, 'grant points', 'grants point')} to a role that no longer exists`,
			detail: 'The access matrix grants a capability to a role that no longer exists in Users.',
			action: 'Remove the grant, or restore the role in Users.',
			sourceStep: 'permissions',
			blocking: false
		});
	}

	// MISSING (Experience → Data): a journey consumes a field its entity does not model.
	const entityFieldNames = new Map<string, Set<string>>();
	for (const e of data.entities) entityFieldNames.set(e.name.trim().toLowerCase(), new Set());
	const entityNameById = new Map(data.entities.map((e) => [e.id, e.name.trim().toLowerCase()]));
	for (const f of data.fields) {
		const en = entityNameById.get(f.entityId);
		if (en) entityFieldNames.get(en)?.add(f.name.trim().toLowerCase());
	}
	let orphanFields = 0;
	for (const read of experience.stepDataReads) {
		const fieldSet = entityFieldNames.get(read.entityName.trim().toLowerCase());
		if (!fieldSet) continue; // entity not modeled at all → the forgotten-table check owns this
		for (const fld of read.fields) {
			if (fld.trim() && !fieldSet.has(fld.trim().toLowerCase())) orphanFields++;
		}
	}
	if (orphanFields > 0) {
		gaps.push({
			id: 'gap-data-orphan-fields',
			checkId: 'data.fields-modeled',
			kind: 'missing',
			kindLabel: 'Field outside its schema',
			provenance: 'detected',
			severity: 'medium',
			title: `${count(orphanFields, 'field')} used by journeys ${orphanFields === 1 ? 'is' : 'are'} missing from ${orphanFields === 1 ? 'its' : 'their'} entity`,
			detail: 'A journey step reads or writes a field its entity does not model.',
			action: 'Add the field to the entity, or fix the journey step.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// DANGLING (Data internal): a foreign-key relation points to a non-existent entity.
	const entityIds = new Set(data.entities.map((e) => e.id));
	const danglingRelations = data.fields.filter(
		(f) => f.relationTargetEntityId && !entityIds.has(f.relationTargetEntityId)
	).length;
	if (danglingRelations > 0) {
		gaps.push({
			id: 'gap-data-dangling-relations',
			checkId: 'data.relations-resolve',
			kind: 'dangling',
			kindLabel: 'Relation to a missing entity',
			provenance: 'detected',
			severity: 'high',
			title: `${count(danglingRelations, 'relation points', 'relations point')} to an entity that no longer exists`,
			detail: 'A foreign-key field references an entity that was renamed or deleted.',
			action: 'Point the relation at an existing entity, or restore the entity.',
			sourceStep: 'data',
			blocking: false
		});
	}

	// ORPHAN (Features → Experience): a Core carries features but no journey exercises it.
	if (experience.journeys.length > 0) {
		const coresWithFeatures = new Set(leafFeatures(features).map((f) => f.coreId));
		const coresWithJourney = new Set(experience.journeys.map((j) => j.coreId));
		const uncoveredCores = [...coresWithFeatures].filter((id) => !coresWithJourney.has(id)).length;
		if (uncoveredCores > 0) {
			gaps.push({
				id: 'gap-features-orphan-core',
				checkId: 'features.core-journey',
				kind: 'orphan',
				kindLabel: 'Core without a journey',
				provenance: 'detected',
				severity: 'medium',
				title: `${count(uncoveredCores, 'capability area has', 'capability areas have')} no journey`,
				detail: 'A capability area carries features that no user journey maps.',
				action: 'Author a journey for each capability area left out.',
				sourceStep: 'experience',
				blocking: false
			});
		}
	}

	return gaps;
}

function leafCount(features: ProjectFeaturesDraft): number {
	return leafFeatures(features).length;
}
