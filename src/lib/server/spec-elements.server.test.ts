import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import type { SpecElement } from '$domain/retrospec';
import { SpecElementsReader, specElementsKey } from './spec-elements.server';

const services = {} as AppServices;
const elements = (id: string): SpecElement[] => [{ id, title: id, owner: 'tech' }];
function deferred() {
	let resolve!: (value: SpecElement[]) => void;
	const promise = new Promise<SpecElement[]>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('concurrent specification validation reads', () => {
	it('shares one full build across twenty concurrent page readers', async () => {
		const pending = deferred();
		const read = vi.fn(() => pending.promise);
		const reader = new SpecElementsReader(read, async () => 'revision-1');
		const requests = Array.from({ length: 20 }, () => reader.execute(services, 'project'));
		await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
		pending.resolve(elements('first'));
		const results = await Promise.all(requests);
		expect(results.every((result) => result === results[0])).toBe(true);
		expect(await reader.execute(services, 'project')).toBe(results[0]);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('keeps a newer model when an older build finishes last', async () => {
		const first = deferred();
		let revision = 'before';
		const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(elements('after'));
		const reader = new SpecElementsReader(read, async () => revision);
		const old = reader.execute(services, 'project');
		await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
		revision = 'after';
		expect(await reader.execute(services, 'project')).toEqual(elements('after'));
		first.resolve(elements('before'));
		await old;
		expect(await reader.execute(services, 'project')).toEqual(elements('after'));
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('does not reuse a pending build after explicit invalidation', async () => {
		const first = deferred();
		const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(elements('fresh'));
		const reader = new SpecElementsReader(read, async () => 'same-revision');
		const old = reader.execute(services, 'project');
		await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
		reader.forget('project');
		expect(await reader.execute(services, 'project')).toEqual(elements('fresh'));
		first.resolve(elements('stale'));
		await old;
		expect(await reader.execute(services, 'project')).toEqual(elements('fresh'));
	});

	it('does not let a late older revision lookup replace a newer cached model', async () => {
		let release!: (key: string) => void;
		const revisions = vi.fn().mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; })).mockResolvedValue('after');
		const read = vi.fn().mockResolvedValueOnce(elements('after')).mockResolvedValueOnce(elements('before'));
		const reader = new SpecElementsReader(read, revisions);
		const old = reader.execute(services, 'project');
		expect(await reader.execute(services, 'project')).toEqual(elements('after'));
		release('before');
		await old;
		expect(await reader.execute(services, 'project')).toEqual(elements('after'));
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('retries failed builds and reads again past its five-minute net', async () => {
		let now = 0;
		const read = vi.fn().mockRejectedValueOnce(new Error('temporarily unavailable')).mockResolvedValue(elements('fresh'));
		const reader = new SpecElementsReader(read, async () => 'same-revision', () => now);
		await expect(reader.execute(services, 'project')).rejects.toThrow('temporarily unavailable');
		await reader.execute(services, 'project');
		now = 5 * 60_000 + 1;
		await reader.execute(services, 'project');
		expect(read).toHaveBeenCalledTimes(3);
	});
});

describe('the elements are read again when what they read moves, not on a timer', () => {
	/** A project whose section revisions and behaviour folder the test moves. */
	function project() {
		const revisions = new Map<string, number>([['features', 4], ['evolution', 900], ['coherence', 12]]);
		let behavior = 'folder-1';
		const services = {
			sectionDocuments: { currentRevisions: async () => revisions, currentRevision: async (_: string, s: string) => revisions.get(s) ?? 0 },
			draftLock: { currentRevisions: async () => new Map<string, number>(), current: async () => 0 },
			behaviorSignature: () => behavior
		} as unknown as AppServices;
		return { services, revisions, setBehavior: (next: string) => void (behavior = next) };
	}

	it('keeps its key while a change request acts or the coherence analysis writes', async () => {
		const p = project();
		const before = await specElementsKey(p.services, 'p');
		p.revisions.set('evolution', 901);
		p.revisions.set('coherence', 13);
		expect(await specElementsKey(p.services, 'p')).toBe(before);
	});

	it('moves its key with a section it reads and with the behaviour folder', async () => {
		const p = project();
		const before = await specElementsKey(p.services, 'p');
		p.revisions.set('features', 5);
		const afterFeatures = await specElementsKey(p.services, 'p');
		expect(afterFeatures).not.toBe(before);
		p.setBehavior('folder-2');
		expect(await specElementsKey(p.services, 'p')).not.toBe(afterFeatures);
	});

	it('serves the same list long after 15 s while nothing moved, and reads again past its net', async () => {
		let now = 0;
		const read = vi.fn().mockResolvedValue(elements('only'));
		const reader = new SpecElementsReader(read, async () => 'same', () => now);
		await reader.execute(services, 'project');
		now = 60_000;
		await reader.execute(services, 'project');
		expect(read).toHaveBeenCalledTimes(1);
		now = 6 * 60_000;
		await reader.execute(services, 'project');
		expect(read).toHaveBeenCalledTimes(2);
	});
});
