import { describe, expect, it, vi } from 'vitest';
import { GraphBuilder, type KnowledgeGraph } from '$domain/graph';
import type { KnowledgeGraphProviderPort, ProjectModelRevisionPort } from '$application/ports';
import { CachedKnowledgeGraph } from './cached-knowledge-graph.server';

const graph = (projectId: string, stamp: string): KnowledgeGraph => {
	const builder = new GraphBuilder();
	builder.addNode({ id: `project:${projectId}`, kind: 'project', context: 'project', label: stamp });
	return builder.build(projectId, stamp);
};

/** A revision reader whose answer the test can move, like a real save would. */
function revisions(initial = 'rev-1') {
	let value = initial;
	const port: ProjectModelRevisionPort = { fingerprint: async () => value };
	return { port, set: (next: string) => (value = next) };
}

function setup(opts: { kernel?: () => string; now?: () => number; freshMs?: number } = {}) {
	const rev = revisions();
	let kernel = opts.kernel ?? (() => 'kernel-1');
	let stamp = 0;
	const build = vi.fn(async (projectId: string) => graph(projectId, `build-${++stamp}`));
	const inner: KnowledgeGraphProviderPort = { build };
	const listeners: Array<(change: { projectId: string }) => void> = [];
	const cache = new CachedKnowledgeGraph(inner, rev.port, () => kernel(), {
		label: 'test',
		now: opts.now ?? (() => 0),
		freshMs: opts.freshMs,
		subscribe: (listener) => {
			listeners.push(listener);
			return () => {};
		}
	});
	return {
		cache,
		build,
		rev,
		setKernel: (next: () => string) => (kernel = next),
		publish: (projectId: string) => listeners.forEach((l) => l({ projectId }))
	};
}

describe('CachedKnowledgeGraph', () => {
	it('assembles the picture once while the spec has not moved', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build } = setup();

		const first = await cache.build('p1');
		const second = await cache.build('p1');

		expect(build).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
	});

	it('assembles again when a section revision moves', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build, rev } = setup();

		const before = await cache.build('p1');
		rev.set('rev-2');
		const after = await cache.build('p1');

		expect(build).toHaveBeenCalledTimes(2);
		expect(after).not.toBe(before);
		expect(after.generatedAt).toBe('build-2');
	});

	it('assembles again when the kernel folder changes without any section revision', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build, setKernel } = setup();

		await cache.build('p1');
		setKernel(() => 'kernel-2');
		await cache.build('p1');

		expect(build).toHaveBeenCalledTimes(2);
	});

	it('shares one assembly between readers arriving together', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build } = setup();

		const [a, b, c] = await Promise.all([cache.build('p1'), cache.build('p1'), cache.build('p1')]);

		expect(build).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('keeps one picture per project', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build } = setup();

		const p1 = await cache.build('p1');
		const p2 = await cache.build('p2');
		await cache.build('p1');
		await cache.build('p2');

		expect(build).toHaveBeenCalledTimes(2);
		expect(p1.projectId).toBe('p1');
		expect(p2.projectId).toBe('p2');
	});

	it('drops a project on a bus change for that project only', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const { cache, build, publish } = setup();

		await cache.build('p1');
		await cache.build('p2');
		publish('p1');
		await cache.build('p1');
		await cache.build('p2');

		expect(build).toHaveBeenCalledTimes(3);
		expect(build.mock.calls.map(([id]) => id)).toEqual(['p1', 'p2', 'p1']);
	});

	it('assembles again once the freshness bound has passed, even with the same key', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		let clock = 0;
		const { cache, build } = setup({ now: () => clock, freshMs: 1000 });

		await cache.build('p1');
		clock = 999;
		await cache.build('p1');
		expect(build).toHaveBeenCalledTimes(1);
		clock = 1001;
		await cache.build('p1');
		expect(build).toHaveBeenCalledTimes(2);
	});

	it('does not remember a failed assembly', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const rev = revisions();
		let attempts = 0;
		const inner: KnowledgeGraphProviderPort = {
			build: async (projectId) => {
				attempts += 1;
				if (attempts === 1) throw new Error('boom');
				return graph(projectId, 'ok');
			}
		};
		const cache = new CachedKnowledgeGraph(inner, rev.port, () => 'k', {
			subscribe: () => () => {}
		});

		await expect(cache.build('p1')).rejects.toThrow('boom');
		await expect(cache.build('p1')).resolves.toMatchObject({ generatedAt: 'ok' });
		expect(attempts).toBe(2);
	});
});
