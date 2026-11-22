import { describe, expect, it, vi } from 'vitest';
import { keepPerRevision } from './revision-kept-loads.server';

function section() {
	let revision = 3;
	let stored = { requests: ['EVO-1'] };
	const read = vi.fn(async (_projectId: string) => structuredClone(stored));
	const loader = { execute: read };
	return { loader, read, write: (next: typeof stored) => { stored = next; revision += 1; }, revision: async () => revision };
}

describe('a section read once per revision', () => {
	it('parses the section once while its revision stays, each caller getting its own copy', async () => {
		const s = section();
		const kept = keepPerRevision(s.loader, s.revision);
		const first = await kept.execute('p');
		const second = await kept.execute('p');
		expect(s.read).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
		second.requests.push('changed by a caller');
		expect((await kept.execute('p')).requests).toEqual(['EVO-1']);
	});

	it('reads it again once a write moved its revision', async () => {
		const s = section();
		const kept = keepPerRevision(s.loader, s.revision);
		await kept.execute('p');
		s.write({ requests: ['EVO-1', 'EVO-2'] });
		expect((await kept.execute('p')).requests).toEqual(['EVO-1', 'EVO-2']);
		expect(s.read).toHaveBeenCalledTimes(2);
	});

	it('keeps nothing when the revision cannot be read', async () => {
		const s = section();
		const kept = keepPerRevision(s.loader, async () => { throw new Error('store down'); });
		await kept.execute('p');
		await kept.execute('p');
		expect(s.read).toHaveBeenCalledTimes(2);
	});
});
