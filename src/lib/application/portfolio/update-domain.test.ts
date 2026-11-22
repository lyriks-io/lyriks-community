import { describe, expect, it } from 'vitest';
import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort } from '$application/ports';
import { UpdateDomainUseCase } from './update-domain';

function folders(...seed: Domain[]) {
	const saved = new Map(seed.map((d) => [d.id, d]));
	const repo = {
		listDomains: async () => [...saved.values()],
		saveDomain: async (d: Domain) => void saved.set(d.id, d),
		setDomainOrder: async () => {},
		removeDomain: async () => {},
		countProjectsInDomain: async () => 0,
		getMeta: async () => null,
		setMeta: async () => {},
		removeMeta: async () => {}
	} satisfies PortfolioRepositoryPort;
	return { update: new UpdateDomainUseCase(repo), saved };
}

const sales: Domain = { id: 'd1', name: 'Sales', description: 'old', icon: 'lucide:briefcase', createdAt: '2026-01-01', position: 2, workspaceId: 'w1' };

describe('renaming a folder of projects', () => {
	it('saves the trimmed name, description and icon, keeping its place and workspace', async () => {
		const { update, saved } = folders(sales);
		expect(await update.execute('d1', '  Revenue ', '  Deals and renewals ', ' lucide:coins ')).toEqual({ updated: true });
		expect(saved.get('d1')).toEqual({ ...sales, name: 'Revenue', description: 'Deals and renewals', icon: 'lucide:coins' });
	});

	it('falls back to the default icon when none is given', async () => {
		const { update, saved } = folders(sales);
		await update.execute('d1', 'Revenue', '', '  ');
		expect(saved.get('d1')?.icon).toBe('lucide:building-2');
	});

	it('refuses a blank name, no folder or a folder that is gone, and changes nothing', async () => {
		const { update, saved } = folders(sales);
		expect(await update.execute('d1', '   ')).toEqual({ updated: false, reason: 'Give the domain a name.' });
		expect(await update.execute('', 'Revenue')).toEqual({ updated: false, reason: 'Choose a domain to edit.' });
		expect(await update.execute('d-gone', 'Revenue')).toEqual({ updated: false, reason: 'That domain no longer exists.' });
		expect(saved.get('d1')).toEqual(sales);
	});
});
