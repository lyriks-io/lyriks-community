/**
 * Shared free-text matching for every in-page search bar.
 *
 * One implementation so "search" means the same thing on every list: it is
 * case- and accent-insensitive (typing `securite` finds "Securite"), and a
 * multi-word query is AND-ed token by token in any order, so "stripe card"
 * matches "Card declined by Stripe". An empty query matches everything, which
 * is what makes the filter a no-op until the user types.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Lowercase + strip diacritics, so accented and unaccented letters compare equal. */
export const normalizeSearch = (value: string): string =>
	value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

/** The query split into normalized tokens; `[]` when there is nothing to search for. */
export const searchTokens = (query: string): string[] =>
	normalizeSearch(query).split(/\s+/).filter(Boolean);

/**
 * True when every token of `query` appears somewhere in `fields`. Nullish and
 * empty fields are ignored, so callers can pass optional values straight in.
 */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
	const tokens = searchTokens(query);
	if (tokens.length === 0) return true;
	const haystack = normalizeSearch(fields.filter(Boolean).join('   '));
	return tokens.every((t) => haystack.includes(t));
}

/** Curried form for `array.filter(...)` pipelines over a projection of each item. */
export const queryFilter =
	<T>(query: string, fields: (item: T) => (string | null | undefined)[]) =>
	(item: T): boolean =>
		matchesQuery(query, ...fields(item));
