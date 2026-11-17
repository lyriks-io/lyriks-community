import { termUsageCounter, type GlossaryTerm } from '$domain/glossary';
import { compareNames, sortByName } from '$domain/shared';
import { text } from './labels';

/**
 * The glossary as the Specification 360° reads it: each governed term, how
 * often the spec uses it and where, and its allowed synonyms; its words to
 * avoid are not part of the reading (criterion badcf09f). Counts are read
 * against every authored section and the behavior model, kept apart by place
 * so the reader sees where a word lives. The terms, their synonyms and where
 * they appear read from A to Z (criterion 4b3d2b4d); the places keep the
 * spec's own order.
 */

/** One place of the spec and its prose. */
export interface ProsePlace {
	readonly place: string;
	readonly text: string;
}

/** A named element of the spec, for "where it appears". */
export interface NamedElement {
	/** "Feature", "Screen", "Table", "User", "Journey". */
	readonly kind: string;
	readonly name: string;
}

export interface GlossaryEntry {
	readonly id: string;
	readonly term: string;
	readonly definition: string;
	readonly uses: number;
	readonly synonyms: readonly string[];
	readonly places: readonly { readonly place: string; readonly uses: number }[];
	readonly where: readonly string[];
}

/** How far "where it appears" goes: enough to locate a word, not an index. */
const WHERE_LIMIT = 12;

export function glossaryEntries(
	terms: readonly GlossaryTerm[],
	places: readonly ProsePlace[],
	elements: readonly NamedElement[]
): GlossaryEntry[] {
	return sortByName(
		terms.filter((t) => text(t.term)),
		(t) => text(t.term)
	)
		.map((t) => {
			const usages = termUsageCounter(t);
			const byPlace = places
				.map((p) => ({ place: p.place, uses: usages(p.text) }))
				.filter((p) => p.uses > 0);
			const namedIn = termUsageCounter({ ...t, synonymsAvoid: [] });
			return {
				id: t.id,
				term: text(t.term),
				definition: text(t.definition),
				uses: byPlace.reduce((n, p) => n + p.uses, 0),
				synonyms: t.synonymsAllowed.map((s) => text(s)).filter(Boolean).sort(compareNames),
				places: byPlace,
				// Two elements of one kind and one name read the same: the place is listed once.
				where: [...new Set(elements.filter((e) => namedIn(e.name) > 0).map((e) => `${e.kind} · ${e.name}`))].sort(compareNames).slice(0, WHERE_LIMIT)
			};
		});
}
