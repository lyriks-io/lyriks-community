/**
 * A request named the way people and reports name it.
 *
 * The board, the timeline and every report written about a dossier shorten its
 * id to the first eight characters, the way a commit is named. Answering "does
 * not exist" to the id everybody quotes sends the reader hunting for the full
 * UUID the answer itself could have given, so any unique prefix is accepted, as
 * git does. A prefix shorter than four characters is too easy to hit by
 * accident, and an ambiguous one is named with its candidates rather than
 * guessed.
 */

export const MIN_REQUEST_PREFIX = 4;

export type RequestLookup<T extends { readonly id: string }> =
	| { readonly kind: 'found'; readonly request: T }
	| { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }
	| { readonly kind: 'none' };

export function findRequestByRef<T extends { readonly id: string }>(
	requests: readonly T[],
	ref: string
): RequestLookup<T> {
	const wanted = ref.trim();
	if (wanted === '') return { kind: 'none' };
	const exact = requests.find((r) => r.id === wanted);
	if (exact) return { kind: 'found', request: exact };
	if (wanted.length < MIN_REQUEST_PREFIX) return { kind: 'none' };
	const lower = wanted.toLowerCase();
	const matches = requests.filter((r) => r.id.toLowerCase().startsWith(lower));
	if (matches.length === 1) return { kind: 'found', request: matches[0] };
	if (matches.length > 1) return { kind: 'ambiguous', candidates: matches.map((r) => r.id) };
	return { kind: 'none' };
}

/** The sentence a refusal carries for a reference that did not resolve to one request. */
export function unresolvedRequestReason(ref: string, lookup: RequestLookup<{ readonly id: string }>): string {
	if (lookup.kind === 'ambiguous')
		return `"${ref}" starts ${lookup.candidates.length} requests: ${lookup.candidates.join(', ')}. Give more of the id.`;
	return `Request "${ref}" does not exist on this project.`;
}
