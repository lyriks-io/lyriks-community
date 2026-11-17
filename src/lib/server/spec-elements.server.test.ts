import { describe, expect, it, vi } from 'vitest';
import type { AppServices } from '$composition/container.server';
import type { SpecElement } from '$domain/retrospec';
import { SpecElementsReader } from './spec-elements.server';

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

	it('retries failed builds and retains the existing fifteen-second freshness limit', async () => {
		let now = 0;
		const read = vi.fn().mockRejectedValueOnce(new Error('temporarily unavailable')).mockResolvedValue(elements('fresh'));
		const reader = new SpecElementsReader(read, async () => 'same-revision', () => now);
		await expect(reader.execute(services, 'project')).rejects.toThrow('temporarily unavailable');
		await reader.execute(services, 'project');
		now = 15_001;
		await reader.execute(services, 'project');
		expect(read).toHaveBeenCalledTimes(3);
	});
});
