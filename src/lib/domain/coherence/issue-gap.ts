import type { IssueKind, ProjectRulesDraft } from '../rules';

/**
 * The id Project health gives an issue of the rules register, one place for
 * both sides: the checker that lists it, and whoever names it later (an
 * evolution request opened on it from the Overview, criterion e0f69b3c).
 *
 * The keyword in the id lands each issue kind in its incoherence bucket
 * (contradictions read as conflicts); it is kept as it is because decisions
 * and requests already reference these ids.
 */
const ISSUE_KIND_HINT: Readonly<Record<IssueKind, string>> = {
	contradiction: 'conflict',
	ambiguity: 'ambiguity',
	missing_rule: 'missing',
	unhandled_edge: 'missing',
	overlap: 'duplicate',
	dead_rule: 'orphan',
	unreachable_state: 'orphan'
};

export function issueGapId(kind: IssueKind, issueId: string): string {
	return `gap-rules-issue-${ISSUE_KIND_HINT[kind]}-${issueId}`;
}

/**
 * An open issue that holds the build gate: a critical contradiction. Project
 * health reads it as blocking, so it is fixed (through an evolution), never
 * kept as it is.
 */
export function isBlockingIssue(issue: Pick<ProjectRulesDraft['issues'][number], 'kind' | 'severity'>): boolean {
	return issue.kind === 'contradiction' && issue.severity === 'critical';
}
