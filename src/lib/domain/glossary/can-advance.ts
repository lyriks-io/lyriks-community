import type { ProjectGlossaryDraft } from './draft';

/** Named terms left without a definition — the loose vocabulary that blocks locking. */
export function undefinedTerms(draft: ProjectGlossaryDraft) {
	return draft.terms.filter((t) => t.term.trim() && !t.definition.trim());
}

/**
 * Minimum bar to consider the vocabulary locked: every named term carries a
 * definition. Mirrors the intent of feature `297051ca` (a governed word must
 * mean one thing before it can steer downstream generation).
 */
export function glossaryCanAdvance(draft: ProjectGlossaryDraft): boolean {
	return missingGlossaryRequirements(draft).length === 0;
}

export function missingGlossaryRequirements(draft: ProjectGlossaryDraft): string[] {
	const named = draft.terms.filter((t) => t.term.trim());
	if (named.length === 0) return ['add at least one term'];
	const undef = undefinedTerms(draft);
	if (undef.length > 0) {
		return [`define ${undef.length} term${undef.length === 1 ? '' : 's'}`];
	}
	return [];
}
