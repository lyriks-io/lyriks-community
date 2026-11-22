import { describe, expect, it } from 'vitest';
import { BuildPortfolioUseCase } from './build-portfolio';
import type { CallerReach } from './project-visibility';
import type { Domain } from '$domain/portfolio';

const folder = (id: string, workspaceId: string): Domain => ({
	id,
	name: id,
	description: '',
	icon: 'lucide:building-2',
	createdAt: '2026-01-01T00:00:00.000Z',
	workspaceId
});

/** Two teams: the caller owns `mine` and is limited to folder `t-open` in `team`, a collaborator on `collaborating`. */
function portfolio(collaborating: readonly string[] = []) {
	const projects = [
		{ id: 'p-mine', ws: 'mine', domainId: 'm-1' },
		{ id: 'p-open', ws: 'team', domainId: 't-open' },
		{ id: 'p-closed', ws: 'team', domainId: 't-closed' },
		{ id: 'p-other', ws: 'other', domainId: 'o-1' }
	];
	const domains = [folder('m-1', 'mine'), folder('t-open', 'team'), folder('t-closed', 'team'), folder('o-1', 'other'), folder('o-empty', 'other')];
	const byId = new Map(projects.map((p) => [p.id, p]));
	return new BuildPortfolioUseCase(
		{ list: async () => projects.map((p) => ({ id: p.id, name: p.id, description: '', lastSavedAt: '' })) } as never,
		{ listDomains: async () => domains, getMeta: async (id: string) => ({ domainId: byId.get(id)?.domainId ?? null, shippedAt: null }) } as never,
		{ analyze: async () => ({ dimensions: [], readinessScore: 0, gaps: [], lastActivityAt: null }) } as never,
		{ execute: async () => ({ features: [] }) } as never,
		{ find: async (id: string) => ({ localProjectId: id, backProjectId: id, backWorkspaceId: byId.get(id)?.ws ?? '', status: 'linked' }) } as never,
		{ execute: async (id: string) => ({ collaborators: collaborating.includes(id) ? [{ email: 'ada@acme.test' }] : [] }) } as never,
		{ loadIdentity: async () => null } as never,
		{ execute: async () => null } as never
	);
}

const reach = (activeId: string): CallerReach => ({
	workspaces: new Map([
		['mine', { role: 'owner', folders: null }],
		['team', { role: 'designer', folders: new Set(['t-open']) }]
	]),
	activeId,
	email: 'ada@acme.test'
});

const ids = (view: Awaited<ReturnType<BuildPortfolioUseCase['execute']>>) => ({
	projects: [...view.domains.flatMap((d) => d.projects), ...view.unassigned].map((p) => p.id).sort(),
	folders: view.domains.map((d) => d.domain.id).sort()
});

describe('BuildPortfolioUseCase reads each project in its own workspace', () => {
	it('keeps a limit in a team whatever workspace the switcher shows [rule:4e30bdda] [scenario:81a4f107]', async () => {
		for (const active of ['mine', 'team']) {
			expect(ids(await portfolio().execute(reach(active)))).toEqual({
				projects: ['p-mine', 'p-open'],
				folders: ['m-1', 't-open']
			});
		}
	});

	it('never lists another workspace\'s folders, empty ones included (issue 156) [rule:4d6baae5]', async () => {
		const { folders } = ids(await portfolio().execute(reach('mine')));
		expect(folders).not.toContain('o-empty');
		expect(folders).not.toContain('o-1');
	});

	it('lists a project the caller collaborates on beyond their folders, with its folder', async () => {
		expect(ids(await portfolio(['p-closed']).execute(reach('mine')))).toEqual({
			projects: ['p-closed', 'p-mine', 'p-open'],
			folders: ['m-1', 't-closed', 't-open']
		});
	});

	it('lists everything when nothing is scoped', async () => {
		expect(ids(await portfolio().execute(null)).projects).toHaveLength(4);
	});
});
