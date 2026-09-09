import {
	createEmptyGlossaryDraft,
	isGlossaryLocale,
	isGlossaryStatus,
	type GlossaryTerm,
	type ProjectGlossaryDraft
} from '$domain/glossary';

/**
 * Anti-corruption guard for untrusted Glossary payloads. Same shape as the
 * sibling parsers: merge over defaults, pin projectId, and rebuild each term
 * through `createTerm` so an id, valid locale/status and array fields are always
 * present regardless of what the client sent.
 */
export function parseGlossaryDraft(input: unknown, projectId: string): ProjectGlossaryDraft {
	const base = createEmptyGlossaryDraft(projectId);
	if (input === null || typeof input !== 'object') return base;
	const src = input as Record<string, unknown>;

	const strArr = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

	const terms: GlossaryTerm[] = [];
	const seen = new Set<string>();
	if (Array.isArray(src.terms)) {
		for (const raw of src.terms) {
			if (!raw || typeof raw !== 'object') continue;
			const term = raw as Record<string, unknown>;
			if (typeof term.id !== 'string' || term.id.length === 0 || seen.has(term.id)) continue;
			seen.add(term.id);
			terms.push({
				id: term.id,
				term: typeof term.term === 'string' ? term.term : '',
				definition: typeof term.definition === 'string' ? term.definition : '',
				synonymsAllowed: strArr(term.synonymsAllowed),
				synonymsAvoid: strArr(term.synonymsAvoid),
				example: typeof term.example === 'string' ? term.example : '',
				locale: isGlossaryLocale(term.locale) ? term.locale : 'en',
				status: isGlossaryStatus(term.status) ? term.status : 'draft',
				sourceIds: strArr(term.sourceIds)
			});
		}
	}

	return {
		...base,
		projectId,
		terms
	};
}
