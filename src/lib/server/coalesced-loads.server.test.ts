import { describe, expect, it, vi } from 'vitest';

const listeners = vi.hoisted(() => [] as ((change: { projectId: string; section: string }) => void)[]);
vi.mock('./sync-bus.server', () => ({ subscribeSectionChanges: (fn: (typeof listeners)[number]) => (listeners.push(fn), () => {}) }));

const { coalesceLoads } = await import('./coalesced-loads.server');

function loader() {
	let reads = 0;
	const pending: ((v: { n: number; list: number[] }) => void)[] = [];
	const l = coalesceLoads({
		execute: (projectId: string) => {
			reads++;
			return new Promise<{ n: number; list: number[] }>((resolve) => pending.push(resolve)).then((v) => ({ ...v, projectId }));
		}
	});
	return { l, pending, reads: () => reads };
}

describe('one read of a section for every caller asking while it runs', () => {
	it('shares a running read and hands each caller its own copy', async () => {
		const { l, pending, reads } = loader();
		const a = l.execute('p');
		const b = l.execute('p');
		expect(reads()).toBe(1);
		pending[0]({ n: 1, list: [1] });
		const [x, y] = (await Promise.all([a, b])) as { n: number; list: number[] }[];
		expect(x).toEqual(y);
		x.list.push(2);
		expect(y.list).toEqual([1]);
	});

	it('reads afresh once the read ended, and after a write to the project', async () => {
		const { l, pending, reads } = loader();
		const a = l.execute('p');
		pending[0]({ n: 1, list: [] });
		await a;
		void l.execute('p');
		expect(reads()).toBe(2);
		for (const fn of listeners) fn({ projectId: 'p', section: 'features' });
		void l.execute('p');
		expect(reads()).toBe(3);
	});

	it('never shares across projects', () => {
		const { l, reads } = loader();
		void l.execute('p');
		void l.execute('q');
		expect(reads()).toBe(2);
	});
});
