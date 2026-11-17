import {
	createEmptyGlossaryDraft,
	isGlossaryLocale,
	isGlossaryStatus,
	termIdBase,
	uniqueTermId,
	type GlossaryTerm,
	type ProjectGlossaryDraft
} from '$domain/glossary';

/** An id the save gave a term that arrived without one, with the word it was made from. */
export interface AssignedTermId {
	readonly id: string;
	readonly term: string;
}

/** A parsed glossary write: the draft to store, and the ids it had to give. */
export interface GlossaryWrite {
	readonly draft: ProjectGlossaryDraft;
	readonly assignedTermIds: readonly AssignedTermId[];
}

const hasId = (term: Record<string, unknown>): term is Record<string, unknown> & { id: string } =>
	typeof term.id === 'string' && term.id.length > 0;

/**
 * Anti-corruption guard for untrusted Glossary payloads. Same shape as the
 * sibling parsers: merge over defaults, pin projectId, and rebuild each term so
 * an id, valid locale/status and array fields are always present regardless of
 * what the client sent.
 *
 * A term sent without an id is kept under one made from its word
 * (criterion c7afe419 of feat-fb747-glossary), never dropped: an id the payload
 * already holds anywhere is never reused, and every id given is reported so the
 * answer can name it. A bare term with no letter or digit has nothing to make an
 * id from; the save's validation refuses it before this runs, so the parser,
 * which must stay total, leaves it out.
 */
export function parseGlossaryWrite(input: unknown, projectId: string): GlossaryWrite {
	const base = createEmptyGlossaryDraft(projectId);
	if (input === null || typeof input !== 'object') return { draft: base, assignedTermIds: [] };
	const src = input as Record<string, unknown>;

	const strArr = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

	const rows = Array.isArray(src.terms)
		? src.terms.filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
		: [];
	// Every id the payload carries is taken before any is made, so a made id never
	// shadows a term that comes later with that id of its own.
	const taken = new Set(rows.filter(hasId).map((row) => row.id));

	const terms: GlossaryTerm[] = [];
	const assignedTermIds: AssignedTermId[] = [];
	const seen = new Set<string>();
	for (const term of rows) {
		const word = typeof term.term === 'string' ? term.term : '';
		let id: string;
		if (hasId(term)) {
			id = term.id;
		} else {
			const made = termIdBase(word);
			if (made === null) continue;
			id = uniqueTermId(made, taken);
			taken.add(id);
			assignedTermIds.push({ id, term: word });
		}
		if (seen.has(id)) continue;
		seen.add(id);
		terms.push({
			id,
			term: word,
			definition: typeof term.definition === 'string' ? term.definition : '',
			synonymsAllowed: strArr(term.synonymsAllowed),
			synonymsAvoid: strArr(term.synonymsAvoid),
			example: typeof term.example === 'string' ? term.example : '',
			locale: isGlossaryLocale(term.locale) ? term.locale : 'en',
			status: isGlossaryStatus(term.status) ? term.status : 'draft',
			sourceIds: strArr(term.sourceIds)
		});
	}

	return {
		draft: { ...base, projectId, terms },
		assignedTermIds
	};
}
