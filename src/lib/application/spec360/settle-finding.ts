import type { ProjectRulesDraft } from '$domain/rules';
import { isBlockingIssue } from '$domain/coherence/issue-gap';
import { isKeptIssue, noteWithKeep, noteWithoutKeep } from '$domain/retrospec/finding-decision';

/**
 * An issue of What Lyriks noticed rejected from the Overview, kept as it is
 * (criterion e0f69b3c): it is resolved, its note saying who kept it and when.
 * Null when the issue is gone, already settled, or blocks the build: that one
 * is fixed through an evolution, never kept. Pure.
 */
export function keepFinding(rules: ProjectRulesDraft, issueId: string, by: string, at: string): ProjectRulesDraft | null {
	const issue = rules.issues.find((i) => i.id === issueId);
	if (!issue || (issue.status !== 'open' && issue.status !== 'in_review') || isBlockingIssue(issue)) return null;
	return { ...rules, issues: rules.issues.map((i) => (i.id === issueId ? { ...i, status: 'resolved', resolutionNote: noteWithKeep(i.resolutionNote, by, at) } : i)) };
}

/**
 * A rejection taken back by Undo (criterion e0f69b3c): the issue is open again,
 * the line its keep added to its note gone. Only a rejected issue is reopened
 * here: one settled any other way (an evolution, the rules register) is not
 * this page's to reopen. Null when the issue is gone or not rejected. Pure.
 */
export function reopenFinding(rules: ProjectRulesDraft, issueId: string): ProjectRulesDraft | null {
	const issue = rules.issues.find((i) => i.id === issueId);
	if (!issue || !isKeptIssue(issue)) return null;
	return { ...rules, issues: rules.issues.map((i) => (i.id === issueId ? { ...i, status: 'open', resolutionNote: noteWithoutKeep(i.resolutionNote) } : i)) };
}
