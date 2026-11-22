import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpecSourcesIndex } from '$application/spec360/sources';
import { SpecSourcesView } from './sources.svelte';

/**
 * What each block of Knowledge rests on, for its sources icon and the panel at its foot (criterion b0ea9889): the
 * sources it cites and the places in the code it was located at, read on demand. Run on the real view over an index
 * the test holds and a server stubbed at fetch.
 */

let index: SpecSourcesIndex;
const reindex = (over: Partial<SpecSourcesIndex> = {}) => (index = { byAnchor: { 'feature:refunds': ['brief.md', 'call.txt'] }, codeCounts: { 'feature:refunds': 3 }, groupsByAnchor: {}, ...over });
const places = { 'feature:refunds': [{ file: 'src/refund.ts', line: 12 }] };

afterEach(() => vi.unstubAllGlobals());

describe("a block's evidence [criterion:b0ea9889]", () => {
	it('counts the sources a block cites and the places in the code it was found at; nothing for a block that cites nothing', () => {
		reindex();
		const view = new SpecSourcesView('p', () => index);
		expect(view.of('feature:refunds')).toEqual(['brief.md', 'call.txt']);
		expect(view.countOf('feature:refunds')).toBe(5);
		expect(view.of('feature:other')).toEqual([]);
		expect(view.countOf('feature:other')).toBe(0);
	});

	it('opens one block at a time', () => {
		const view = new SpecSourcesView('p', () => reindex());
		view.toggle('feature:refunds');
		expect(view.openAnchor).toBe('feature:refunds');
		view.toggle('feature:other');
		expect(view.openAnchor).toBe('feature:other');
		view.toggle('feature:other');
		expect(view.openAnchor).toBeNull();
	});

	it('reads the places in the code once for an index, and again once the index is reloaded', async () => {
		reindex();
		const send = vi.fn(async (_url: string) => Response.json(places));
		vi.stubGlobal('fetch', send);
		const view = new SpecSourcesView('p 1', () => index);
		expect(view.codeOf('feature:refunds')).toEqual([]);
		await view.readPlaces();
		await view.readPlaces();
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0][0]).toBe('/projects/p%201/spec/code-places');
		expect(view.codeOf('feature:refunds')).toEqual(places['feature:refunds']);
		reindex();
		await view.readPlaces();
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('tries again the next time a block opens when the read failed', async () => {
		reindex();
		const send = vi.fn(async (_url: string) => new Response('down', { status: 503 }));
		vi.stubGlobal('fetch', send);
		const view = new SpecSourcesView('p', () => index);
		await view.readPlaces();
		expect(view.codeOf('feature:refunds')).toEqual([]);
		send.mockImplementation(async () => Response.json(places));
		await view.readPlaces();
		expect(send).toHaveBeenCalledTimes(2);
		expect(view.codeOf('feature:refunds')).toEqual(places['feature:refunds']);
	});
});
