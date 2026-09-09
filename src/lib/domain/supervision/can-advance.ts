import type { Assignment, ProjectSupervisionDraft } from './draft';

/** Scopes with no owner and a settled-or-sooner due date — the loose ends. */
export function unassignedScopes(draft: ProjectSupervisionDraft): Assignment[] {
	return draft.assignments.filter((a) => !a.assignee.trim() && a.status !== 'done');
}

/**
 * Minimum bar for a healthy supervision board: every open scope has an owner
 * and no AI policy rule is left in violation. Mirrors the intent of feature
 * `3d1cc881` (pilot the team without loose, unowned or non-compliant work).
 */
export function supervisionCanAdvance(draft: ProjectSupervisionDraft): boolean {
	return missingSupervisionRequirements(draft).length === 0;
}

export function missingSupervisionRequirements(draft: ProjectSupervisionDraft): string[] {
	const missing: string[] = [];
	const unowned = unassignedScopes(draft);
	if (unowned.length > 0) {
		missing.push(`assign ${unowned.length} open scope${unowned.length === 1 ? '' : 's'}`);
	}
	const violations = draft.policyRules.filter((r) => r.status === 'violation').length;
	if (violations > 0) {
		missing.push(`resolve ${violations} AI policy violation${violations === 1 ? '' : 's'}`);
	}
	return missing;
}
