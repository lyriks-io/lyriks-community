import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '$domain/catalog';
import { createEmptyFeaturesDraft, type Feature, type ProjectFeaturesDraft } from '$domain/features';
import type { Domain } from '$domain/portfolio';
import type { Collaborator } from '$domain/team';
import type {
	BackLinkRepositoryPort,
	FeaturesDraftRepositoryPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
	ProjectMeta,
	TeamGatewayPort
} from '$application/ports';
import { LoadTeamUseCase } from '../collaboration/load-team';
import { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';
import type { CallerReach } from './project-visibility';
import { SearchPortfolioUseCase } from './search-portfolio';

interface Project {
	id: string;
	name: string;
	description?: string;
	workspace: string;
	folder: string | null;
	features?: ProjectFeaturesDraft;
	collaborators?: string[];
}

const leaf = (id: string, name: string, coreId = '', parentFamilyId: string | null = null): Feature => ({
	id,
	name,
	coreId,
	parentFamilyId,
	description: '',
	unspaghettitFeatureId: id
});

/** The catalog, folders, workspace links, feature trees and teams of a set of projects, held in memory. */
function search(projects: Project[]): SearchPortfolioUseCase {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const catalog = {
		list: async (): Promise<ProjectSummary[]> => projects.map((p) => ({ id: p.id, name: p.name, description: p.description ?? '', industry: '', lastSavedAt: null })),
		remove: async () => {}
	} satisfies ProjectCatalogPort;
	const features = {
		load: async (id: string) => byId.get(id)?.features ?? null,
		save: async () => {}
	} satisfies FeaturesDraftRepositoryPort;
	const links = {
		find: async (id: string) => {
			const p = byId.get(id);
			return p ? { localProjectId: id, backProjectId: id, backWorkspaceId: p.workspace, status: 'linked' as const } : null;
		},
		save: async () => {},
		markStatus: async () => {},
		nextEnvelopeVersion: async () => null
	} satisfies BackLinkRepositoryPort;
	const teams = {
		enabled: true,
		getTeam: async (id: string) => ({
			collaborators: (byId.get(id)?.collaborators ?? []).map(
				(email): Collaborator => ({ id: email, name: email, email, color: 'blue', role: 'contributor', seniority: 'ic', expertise: [], scope: [], joinedAt: '' })
			)
		}),
		addCollaborator: async () => null,
		removeCollaborator: async () => false
	} satisfies TeamGatewayPort;
	const portfolio = {
		listDomains: async (): Promise<Domain[]> => [],
		saveDomain: async () => {},
		setDomainOrder: async () => {},
		removeDomain: async () => {},
		countProjectsInDomain: async () => 0,
		getMeta: async (id: string): Promise<ProjectMeta | null> => ({ domainId: byId.get(id)?.folder ?? null, shippedAt: null }),
		setMeta: async () => {},
		removeMeta: async () => {}
	} satisfies PortfolioRepositoryPort;
	return new SearchPortfolioUseCase(catalog, new LoadFeaturesDraftUseCase(features), links, new LoadTeamUseCase(teams), portfolio);
}

const tree = (...features: Feature[]): ProjectFeaturesDraft => ({
	...createEmptyFeaturesDraft('x'),
	cores: [{ id: 'core-pay', name: 'Payments', description: '', tone: 'payment' }],
	families: [{ id: 'fam-refund', name: 'Refunds', coreId: 'core-pay', parentFamilyId: null, description: '' }],
	features
});

describe('the global search box', () => {
	it('finds projects by name or description and features by name, whatever the case', async () => {
		const results = await search([
			{ id: 'billing', name: 'Billing', description: 'Invoices and REFUNDS', workspace: 'w', folder: null },
			{ id: 'shop', name: 'Shop', workspace: 'w', folder: null, features: tree(leaf('f1', 'Refund an order', 'core-pay', 'fam-refund')) },
			{ id: 'blog', name: 'Blog', workspace: 'w', folder: null }
		]).execute('  ReFund ');
		expect(results).toEqual([
			{ kind: 'project', projectId: 'billing', projectName: 'Billing', label: 'Billing', context: '', href: '/projects/billing/scope' },
			{ kind: 'feature', projectId: 'shop', projectName: 'Shop', label: 'Refund an order', context: 'Payments / Refunds', href: '/projects/shop/features' }
		]);
	});

	it('searches nothing under two characters', async () => {
		expect(await search([{ id: 'a', name: 'A', workspace: 'w', folder: null }]).execute(' a ')).toEqual([]);
	});

	it('shows two same-named features once each where they sit, and twice the same one only once', async () => {
		const results = await search([
			{
				id: 'shop',
				name: 'Shop',
				workspace: 'w',
				folder: null,
				features: tree(leaf('f1', 'Export', 'core-pay'), leaf('f2', 'Export', 'core-pay', 'fam-refund'), leaf('f3', 'Export', 'core-pay'))
			}
		]).execute('export');
		expect(results.map((r) => r.context)).toEqual(['Payments', 'Payments / Refunds']);
	});

	it('caps the dropdown at eight projects and twelve features', async () => {
		const projects = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Alpha ${i}`, workspace: 'w', folder: null }));
		const many = tree(...Array.from({ length: 15 }, (_, i) => leaf(`f${i}`, `Alpha step ${i}`)));
		const results = await search([...projects, { id: 'big', name: 'Big', workspace: 'w', folder: null, features: many }]).execute('alpha');
		expect(results.filter((r) => r.kind === 'project')).toHaveLength(8);
		expect(results.filter((r) => r.kind === 'feature')).toHaveLength(12);
	});

	it('never shows a project of a workspace the caller is not in, nor one outside their folders unless they were added to it', async () => {
		const reach: CallerReach = {
			workspaces: new Map([['team', { role: 'designer', folders: new Set(['open']) }]]),
			activeId: 'team',
			email: 'ada@acme.test'
		};
		const results = await search([
			{ id: 'p-open', name: 'Plan open', workspace: 'team', folder: 'open' },
			{ id: 'p-closed', name: 'Plan closed', workspace: 'team', folder: 'closed' },
			{ id: 'p-invited', name: 'Plan invited', workspace: 'team', folder: 'closed', collaborators: ['ADA@acme.test'] },
			{ id: 'p-elsewhere', name: 'Plan elsewhere', workspace: 'other', folder: null, features: tree(leaf('f1', 'Plan the week')) }
		]).execute('plan', reach);
		expect(results.map((r) => r.projectId).sort()).toEqual(['p-invited', 'p-open']);
	});
});
