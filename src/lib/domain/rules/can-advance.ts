import { SETTLED_STATUSES } from './enums';
import type { Issue, ProjectRulesDraft } from './draft';

/** Open (unsettled) contradictions rated critical — the things that block a push. */
export function openCriticalContradictions(draft: ProjectRulesDraft): Issue[] {
	return draft.issues.filter(
		(i) =>
			i.kind === 'contradiction' &&
			i.severity === 'critical' &&
			!SETTLED_STATUSES.includes(i.status)
	);
}

/**
 * Minimum bar to unlock Step 07 (Data & flows): no open critical contradiction
 * is left unresolved. Mirrors the feature invariant on `e06f420a`.
 */
export function rulesCanAdvance(draft: ProjectRulesDraft): boolean {
	return missingRulesRequirements(draft).length === 0;
}

export function missingRulesRequirements(draft: ProjectRulesDraft): string[] {
	const open = openCriticalContradictions(draft);
	if (open.length > 0) {
		return [`resolve ${open.length} critical contradiction${open.length === 1 ? '' : 's'}`];
	}
	return [];
}
