import type {
	EdgeOutcome,
	IssueKind,
	IssueSeverity,
	IssueStatus,
	RuleCategory,
	RuleSource
} from './enums';

/* ── Entities — mirror of Unspaghettit feature e06f420a ─────────────── */

/**
 * One read-only row of the rule inventory, mirrored from an upstream step.
 * Never authored here — recomputed on load from Steps 02 / 03 / 05.
 */
export interface ConsolidatedRule {
	readonly id: string;
	label: string;
	category: RuleCategory;
	source: RuleSource;
	sourceRefId: string;
	statement: string;
	mandatory: boolean;
}

/**
 * One tracked problem found across the declared rules. Auto-detected issues
 * (autoDetected=true) come from the automatic scan (heuristics + engine); the rest are
 * authored by the team.
 */
export interface Issue {
	readonly id: string;
	kind: IssueKind;
	title: string;
	detail: string;
	severity: IssueSeverity;
	status: IssueStatus;
	ownerRoleId: string | null;
	resolutionNote: string;
	relatedRuleIds: string[];
	relatedFeatureId: string | null;
	relatedJourneyId: string | null;
	autoDetected: boolean;
	/** Ids from the project Documents & Sources register that evidence this issue. */
	sourceIds: string[];
}

/** A risky edge case as a plain Given/When/Then acceptance test. */
export interface EdgeCase {
	readonly id: string;
	title: string;
	given: string;
	whenText: string;
	then: string;
	expectedOutcome: EdgeOutcome;
	relatedIssueId: string | null;
	relatedJourneyId: string | null;
	covered: boolean;
	/** Ids from the project Documents & Sources register that this case comes from. */
	sourceIds: string[];
}

/**
 * The persisted content of Step 06. `inventory` is a read-only mirror of the
 * rules declared upstream — refreshed on every load, persisted only so a reload
 * before the next save still renders the corpus.
 */
export interface ProjectRulesDraft {
	projectId: string;
	issues: Issue[];
	scenarios: EdgeCase[];
	inventory: ConsolidatedRule[];
	lastSavedAt: string | null;
}

export function createEmptyRulesDraft(projectId: string): ProjectRulesDraft {
	return {
		projectId,
		issues: [],
		scenarios: [],
		inventory: [],
		lastSavedAt: null
	};
}

function newId(): string {
	return crypto.randomUUID();
}

export function createIssue(overrides: Partial<Issue> = {}): Issue {
	return {
		id: newId(),
		kind: 'contradiction',
		title: '',
		detail: '',
		severity: 'major',
		status: 'open',
		ownerRoleId: null,
		resolutionNote: '',
		relatedRuleIds: [],
		relatedFeatureId: null,
		relatedJourneyId: null,
		autoDetected: false,
		sourceIds: [],
		...overrides
	};
}

export function createEdgeCase(overrides: Partial<EdgeCase> = {}): EdgeCase {
	return {
		id: newId(),
		title: '',
		given: '',
		whenText: '',
		then: '',
		expectedOutcome: 'success',
		relatedIssueId: null,
		relatedJourneyId: null,
		covered: false,
		sourceIds: [],
		...overrides
	};
}
