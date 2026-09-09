import { describe, expect, it } from 'vitest';
import { BackgroundLane } from './background-lane.server';

/** A task that resolves only when told, so ordering can be observed. */
function gate<T>(value: T) {
	let open!: () => void;
	const opened = new Promise<void>((resolve) => (open = resolve));
	return { open, run: () => opened.then(() => value) };
}

describe('BackgroundLane', () => {
	it('runs one task at a time, lowest priority number first', async () => {
		const lane = new BackgroundLane();
		const order: string[] = [];
		const first = gate('first');
		// `first` starts immediately and holds the lane; the rest queue behind it.
		const p1 = lane.run('a', 2, () => first.run().then((v) => (order.push(v), v)));
		const p2 = lane.run('b', 2, async () => (order.push('second-queued'), 'x'));
		const p3 = lane.run('c', 0, async () => (order.push('urgent'), 'y'));
		expect(lane.pending).toBe(2);

		first.open();
		await Promise.all([p1, p2, p3]);
		expect(order).toEqual(['first', 'urgent', 'second-queued']);
	});

	it('runs a key queued twice before it started only once', async () => {
		const lane = new BackgroundLane();
		let runs = 0;
		const first = gate('hold');
		void lane.run('hold', 0, first.run);
		const a = lane.run('same', 1, async () => ++runs);
		const b = lane.run('same', 1, async () => ++runs);
		first.open();
		expect(await Promise.all([a, b])).toEqual([1, 1]);
		expect(runs).toBe(1);
	});

	it('keeps draining after a task fails', async () => {
		const lane = new BackgroundLane();
		await expect(lane.run('bad', 0, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
		await expect(lane.run('good', 0, async () => 'ok')).resolves.toBe('ok');
	});
});
