import { describe, expect, it } from 'vitest';
import type { BackLinkRepositoryPort, BackProjectLink } from '$application/ports';
import { placeInWorkspaces, scopeToWorkspace } from './scope-to-workspace';

/** The local mirror of which workspace each project belongs to, held in memory. */
class LinkTable implements BackLinkRepositoryPort {
	private readonly rows = new Map<string, BackProjectLink>();
	constructor(links: Record<string, string>) {
		for (const [localProjectId, backWorkspaceId] of Object.entries(links))
			this.rows.set(localProjectId, { localProjectId, backProjectId: `back-${localProjectId}`, backWorkspaceId, status: 'linked' });
	}
	async find(localProjectId: string) {
		return this.rows.get(localProjectId) ?? null;
	}
	async save() {}
	async markStatus() {}
	async nextEnvelopeVersion() {
		return null;
	}
}

const projects = [{ id: 'acme-crm' }, { id: 'acme-site' }, { id: 'globex-erp' }, { id: 'never-mirrored' }];
const links = new LinkTable({ 'acme-crm': 'ws-acme', 'acme-site': 'ws-acme', 'globex-erp': 'ws-globex' });

describe('listing projects across tenants', () => {
	it('keeps only the projects of the workspaces the caller belongs to', async () => {
		const seen = await scopeToWorkspace(projects, new Set(['ws-acme']), links);
		expect(seen.map((p) => p.id)).toEqual(['acme-crm', 'acme-site']);
	});

	it('shows nothing to a caller in no workspace, and never a project with no workspace link, under scope', async () => {
		expect(await scopeToWorkspace(projects, new Set(), links)).toEqual([]);
		const all = await scopeToWorkspace(projects, new Set(['ws-acme', 'ws-globex']), links);
		expect(all.map((p) => p.id)).toEqual(['acme-crm', 'acme-site', 'globex-erp']);
	});

	it('lists every project when the install does not scope by workspace', async () => {
		expect((await scopeToWorkspace(projects, null, links)).map((p) => p.id)).toEqual(projects.map((p) => p.id));
	});
});

describe('placing projects in their workspaces', () => {
	it('keeps the workspace each allowed project belongs to, and drops the rest', async () => {
		expect(await placeInWorkspaces(projects, new Set(['ws-globex']), links)).toEqual([{ item: { id: 'globex-erp' }, workspaceId: 'ws-globex' }]);
		expect(await placeInWorkspaces(projects, new Set(), links)).toEqual([]);
	});

	it('keeps every project unscoped, with no workspace for a project never mirrored', async () => {
		const placed = await placeInWorkspaces(projects, null, links);
		expect(placed.map((p) => [p.item.id, p.workspaceId])).toEqual([
			['acme-crm', 'ws-acme'],
			['acme-site', 'ws-acme'],
			['globex-erp', 'ws-globex'],
			['never-mirrored', null]
		]);
	});
});
