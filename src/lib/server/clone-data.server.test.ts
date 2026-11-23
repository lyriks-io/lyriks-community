import { describe, expect, it } from 'vitest';
import { cloneData } from './clone-data.server';

describe('cloneData', () => {
	it('gives the same value as structuredClone for plain data', () => {
		const draft = {
			projectId: 'p',
			requests: [{ id: 'r1', leafIds: ['a', 'b'], stage: 'draft', note: null, done: false, count: 0, missing: undefined }],
			nested: { deep: { deeper: [1, 2, { x: 'y' }] } },
			lastSavedAt: null
		};
		expect(cloneData(draft)).toStrictEqual(structuredClone(draft));
	});

	it('copies every object and array, so a change to the copy leaves the original as it was', () => {
		const draft = { requests: [{ id: 'r1', leafIds: ['a'] }], meta: { n: 1 } };
		const copy = cloneData(draft);
		copy.requests[0].leafIds.push('b');
		copy.requests.push({ id: 'r2', leafIds: [] });
		copy.meta.n = 2;
		expect(draft).toEqual({ requests: [{ id: 'r1', leafIds: ['a'] }], meta: { n: 1 } });
		expect(copy.requests).not.toBe(draft.requests);
	});

	it('copies what is not plain data the way structuredClone does', () => {
		const at = new Date('2026-11-23T00:00:00Z');
		const value = { at, tags: new Map([['k', 1]]), bytes: new Uint8Array([1, 2]) };
		const copy = cloneData(value);
		expect(copy.at).toBeInstanceOf(Date);
		expect(copy.at).not.toBe(at);
		expect(copy.at.getTime()).toBe(at.getTime());
		expect(copy.tags).toEqual(new Map([['k', 1]]));
		expect(copy.bytes).toEqual(new Uint8Array([1, 2]));
	});

	it('falls back to structuredClone on a cycle instead of overflowing', () => {
		const value: { name: string; self?: unknown } = { name: 'loop' };
		value.self = value;
		const copy = cloneData(value) as { name: string; self: unknown };
		expect(copy.name).toBe('loop');
		expect(copy.self).toBe(copy);
	});

	it('keeps an object with no prototype as plain data', () => {
		const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: [1] });
		const copy = cloneData(bare);
		expect(copy.a).toEqual([1]);
		expect(copy.a).not.toBe(bare.a);
	});
});
