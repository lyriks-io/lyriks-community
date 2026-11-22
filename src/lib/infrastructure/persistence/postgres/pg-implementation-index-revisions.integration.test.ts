import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { pgQuery } from './pg-database.server';
import { PgImplementationIndexRevisions } from './pg-implementation-index-revisions.server';

const projectId = `pg-index-revision-${randomUUID()}`;
const integration = process.env.LYRIKS_PG_URL ? describe : describe.skip;

/**
 * The revision of an implementation index in the database every platform node
 * shares (feat-100, criteria fbe61ab1 and 93abb7df): writes of one project run
 * one at a time, each that lands raises the revision by one and records the
 * units it wrote, and one that lands nothing leaves both as they were.
 */
integration('PostgreSQL revisions of an implementation index', () => {
	afterAll(async () => {
		await pgQuery('DELETE FROM implementation_index_unit_writes WHERE project_id = $1', [projectId]);
		await pgQuery('DELETE FROM implementation_index_revisions WHERE project_id = $1', [projectId]);
	});

	it('raises the revision at each write that lands, records its units, and serializes concurrent writes [criterion:fbe61ab1]', async () => {
		const store = new PgImplementationIndexRevisions();
		expect(await store.current(projectId)).toBe(0);
		const first = await store.serialize(projectId, ['action:a1'], async (now) => {
			expect(now).toEqual({ revision: 0, lastWritten: new Map() });
			return { written: ['action:a1', 'surface:s1'], value: 'synced' };
		});
		expect(first).toEqual({ revision: 1, value: 'synced' });
		const untouched = await store.serialize(projectId, ['action:a1', 'surface:s1', 'action:never'], async (now) => {
			expect(now.revision).toBe(1);
			expect(now.lastWritten).toEqual(new Map([['action:a1', 1], ['surface:s1', 1]]));
			return { written: null, value: 'refused' };
		});
		expect(untouched).toEqual({ revision: 1, value: 'refused' });

		// Two writes at once: the second reads what the first wrote.
		const order: number[] = [];
		const write = (unit: string) =>
			store.serialize(projectId, [unit], async (now) => {
				order.push(now.revision);
				await new Promise((resolve) => setTimeout(resolve, 50));
				return { written: [unit], value: now.revision };
			});
		const [a, b] = await Promise.all([write('action:a1'), write('action:a2')]);
		expect([a.revision, b.revision].sort()).toEqual([2, 3]);
		expect(order.sort()).toEqual([1, 2]);
		expect(await store.current(projectId)).toBe(3);
	});

	it('leaves nothing written when the write throws', async () => {
		const store = new PgImplementationIndexRevisions();
		const before = await store.current(projectId);
		await expect(store.serialize(projectId, [], async () => Promise.reject(new Error('engine gone')))).rejects.toThrow('engine gone');
		expect(await store.current(projectId)).toBe(before);
	});
});
