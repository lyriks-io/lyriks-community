import { describe, expect, it } from 'vitest';
import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort } from '$application/ports';
import { REORDER_OUTSIDE_LIST, ReorderDomainsUseCase } from './reorder-domains';

const domain = (id: string, position: number | null = null): Domain => ({ id, name: id, description: '', icon: '', createdAt: '', position });

function repo(seed: Domain[]) {
	const domains = new Map(seed.map((d) => [d.id, d]));
	const writes: string[][] = [];
	const port = {
		listDomains: async () => [...domains.values()],
		saveDomain: async (d: Domain) => void domains.set(d.id, { ...d, position: domains.get(d.id)?.position ?? null }),
		setDomainOrder: async (ids: readonly string[]) => {
			writes.push([...ids]);
			ids.forEach((id, i) => domains.set(id, { ...domains.get(id)!, position: i }));
		},
		removeDomain: async () => {},
		countProjectsInDomain: async () => 0,
		getMeta: async () => null,
		setMeta: async () => {},
		removeMeta: async () => {}
	} satisfies PortfolioRepositoryPort;
	return { port, domains, writes };
}

describe('the folders are put in order by dragging them [criterion:ddf5cc35] [action:5ccc378f]', () => {
	it('saves every folder at its place in one write', async () => {
		const r = repo([domain('eng'), domain('ops'), domain('sales')]);
		expect(await new ReorderDomainsUseCase(r.port).execute(['sales', 'eng', 'ops'])).toEqual({ reordered: true });
		expect(r.writes).toEqual([['sales', 'eng', 'ops']]);
		expect([...r.domains.values()].map((d) => `${d.id}@${d.position}`)).toEqual(['eng@1', 'ops@2', 'sales@0']);
	});

	it('changes nothing for a list that is not the folders as they stand [rule:a20195a8]', async () => {
		const r = repo([domain('eng', 0), domain('ops', 1), domain('sales', 2)]);
		const reorder = new ReorderDomainsUseCase(r.port);
		// A folder created since is missing, one deleted since is named, one is named twice.
		for (const ids of [['ops', 'eng'], ['ops', 'eng', 'sales', 'gone'], ['ops', 'ops', 'eng']]) {
			expect(await reorder.execute(ids)).toEqual({ reordered: false, reason: REORDER_OUTSIDE_LIST });
		}
		expect(r.writes).toEqual([]);
	});

	it('never loses a place when a folder is renamed', async () => {
		const r = repo([domain('eng', 1)]);
		await r.port.saveDomain({ ...domain('eng'), name: 'Engineering', position: undefined });
		expect(r.domains.get('eng')?.position).toBe(1);
	});
});
