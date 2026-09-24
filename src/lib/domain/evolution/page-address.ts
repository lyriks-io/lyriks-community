/**
 * Where on a request's page a person acts, as an address.
 *
 * Every place a person is asked for something (a field of a touched feature,
 * a proposal to sign, the next gate, a report line, an observation) has one,
 * so whoever asks for the act, a page or an AI client, can hand over a link
 * that opens on it instead of a description of where to look.
 *
 * The place travels as a query parameter, never as a fragment: a fragment is
 * never sent to the server, so it would be lost on the way through sign-in,
 * and a link that loses its place on the one path most people take the first
 * time is not a link to the place.
 */

/** The query parameter that carries the place. */
export const PLACE_PARAM = 'at';

export type PagePlace =
	| { readonly kind: 'field'; readonly leafId: string | null; readonly path: string }
	| { readonly kind: 'proposal'; readonly id: string }
	| { readonly kind: 'next-step' }
	| { readonly kind: 'line'; readonly id: string }
	| { readonly kind: 'observation'; readonly id: string };

/** Separates the parts of a place. Absent from leaf ids, field paths and uuids. */
const SEP = '__';
/** Stands for "no touched feature" in a field place. */
const NO_LEAF = 'request';

/** The place as the one string the address carries. */
export function placeKey(place: PagePlace): string {
	switch (place.kind) {
		case 'field':
			return ['field', place.leafId ?? NO_LEAF, place.path].join(SEP);
		case 'proposal':
			return ['proposal', place.id].join(SEP);
		case 'next-step':
			return 'next-step';
		case 'line':
			return ['line', place.id].join(SEP);
		case 'observation':
			return ['observation', place.id].join(SEP);
	}
}

/** The place an address names, or null when it names none this page knows. */
export function parsePlace(key: string | null | undefined): PagePlace | null {
	if (!key) return null;
	if (key === 'next-step') return { kind: 'next-step' };
	const [kind, ...rest] = key.split(SEP);
	if (kind === 'field' && rest.length === 2 && rest[0] && rest[1]) {
		return { kind: 'field', leafId: rest[0] === NO_LEAF ? null : rest[0], path: rest[1] };
	}
	if ((kind === 'proposal' || kind === 'line' || kind === 'observation') && rest.length === 1 && rest[0]) {
		return { kind, id: rest[0] };
	}
	return null;
}

/** The element id the page gives a place, so the address and the page agree by construction. */
export function placeElementId(place: PagePlace): string {
	return `place-${placeKey(place)}`;
}

/** The path of a request's page, opening on one place when one is named. Relative to the installation. */
export function requestPagePath(projectId: string, requestId: string, place?: PagePlace): string {
	const query = new URLSearchParams({ tab: 'evolution', request: requestId });
	if (place) query.set(PLACE_PARAM, placeKey(place));
	return `/projects/${encodeURIComponent(projectId)}/features?${query.toString()}`;
}
