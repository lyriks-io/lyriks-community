import { describe, expect, it } from 'vitest';
import { PLACE_PARAM, parsePlace, placeElementId, placeKey, requestPagePath, type PagePlace } from './page-address';

describe('the address of a place on a request page', () => {
	const places: PagePlace[] = [
		{ kind: 'field', leafId: 'draft:e2196da8-8ee5-4739-83e6-514b74aee224', path: '01-origin.objective' },
		{ kind: 'field', leafId: 'feat-evo-single-page-form', path: '05-functional.acceptance' },
		{ kind: 'field', leafId: null, path: '02-problem.value' },
		{ kind: 'proposal', id: '2116f3be-9cdd-4a34-a4fe-c8fcb05e2cb3' },
		{ kind: 'next-step' },
		{ kind: 'line', id: 'line-abc' },
		{ kind: 'observation', id: 'obs-1' }
	];

	it('reads back every place it writes, a draft leaf and a dotted path included', () => {
		for (const place of places) expect(parsePlace(placeKey(place))).toEqual(place);
	});

	it('names no place for an address it does not know, rather than guessing', () => {
		for (const key of ['', null, undefined, 'field__only-a-leaf', 'proposal__', 'unknown__x', 'impact']) {
			expect(parsePlace(key)).toBeNull();
		}
	});

	it('carries the place as a query parameter, which survives the way through sign-in', () => {
		const path = requestPagePath('lyriks-feb747', 'req-1', { kind: 'proposal', id: 'p-1' });
		expect(path.startsWith('/projects/lyriks-feb747/features?')).toBe(true);
		expect(path).not.toContain('#');
		const query = new URL(path, 'http://x').searchParams;
		expect(query.get('tab')).toBe('evolution');
		expect(query.get('request')).toBe('req-1');
		expect(parsePlace(query.get(PLACE_PARAM))).toEqual({ kind: 'proposal', id: 'p-1' });
	});

	it('opens the request itself when no place is named', () => {
		expect(requestPagePath('p', 'r')).toBe('/projects/p/features?tab=evolution&request=r');
	});

	it('gives the page and the address the same element id', () => {
		const place: PagePlace = { kind: 'line', id: 'l-9' };
		expect(placeElementId(place)).toBe(`place-${placeKey(place)}`);
	});
});
