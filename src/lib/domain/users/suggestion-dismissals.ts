/**
 * A suggested persona the author removed (spec action `6f8ad21b`). Suggestions
 * are recomputed on every load, by the platform and by any model reading the
 * project over the MCP, so the refusal is kept as a decision: what was offered,
 * why, when and by whom (criterion `b1242208`). Only the close button of a
 * pending card records one; removing a persona that came from a suggestion
 * does not (criterion `cc652323`).
 */
export interface SuggestionDismissal {
	/** What a later suggestion is matched on (see `suggestionKey`). */
	readonly key: string;
	/** The name as the card showed it. */
	readonly name: string;
	/** Why it was offered, so a suggester sees what was refused and not only a name. */
	readonly rationale: string;
	readonly dismissedAt: string | null;
	/** Who removed it; null when unknown (a dismissal kept before authors were). */
	readonly dismissedBy: string | null;
}

/** `Site manager`, `site_manager` and ` site  manager ` are one suggestion. */
export function suggestionKey(name: string): string {
	return name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isSuggestionDismissed(
	dismissals: readonly SuggestionDismissal[],
	name: string
): boolean {
	const key = suggestionKey(name);
	return dismissals.some((d) => d.key === key);
}

/** The history with this suggestion's dismissal added; unchanged when already dismissed. */
export function withSuggestionDismissed(
	dismissals: readonly SuggestionDismissal[],
	suggestion: { readonly name: string; readonly rationale: string },
	dismissedAt: string,
	dismissedBy: string | null
): SuggestionDismissal[] {
	const key = suggestionKey(suggestion.name);
	if (!key || dismissals.some((d) => d.key === key)) return [...dismissals];
	return [
		...dismissals,
		{ key, name: suggestion.name.trim(), rationale: suggestion.rationale, dismissedAt, dismissedBy }
	];
}

/**
 * Append-only union of what is stored and what a write brings: no later write
 * (a stale tab, an MCP client replacing the section) can erase a decision. The
 * first record of a name wins, so its date and author stay the original ones.
 */
export function mergeSuggestionDismissals(
	stored: readonly SuggestionDismissal[],
	incoming: readonly SuggestionDismissal[]
): SuggestionDismissal[] {
	const out = [...stored];
	for (const d of incoming) if (!out.some((s) => s.key === d.key)) out.push(d);
	return out;
}
