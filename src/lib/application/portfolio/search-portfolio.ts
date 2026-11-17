import { leafFeatures } from '$domain/features';
import type {
	BackLinkRepositoryPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
} from '$application/ports';
import { placeInWorkspaces } from '$application/portfolio/scope-to-workspace';
import {
	isProjectVisible,
	visibilityIn,
	workspaceIdsOf,
	type CallerReach,
} from '$application/portfolio/project-visibility';
import type { LoadFeaturesDraftUseCase } from '../specification/load-features-draft';
import type { LoadTeamUseCase } from '../collaboration/load-team';

export interface SearchResult {
	kind: 'project' | 'feature';
	projectId: string;
	projectName: string;
	label: string;
	/** Disambiguating context: a component's core / family path; empty for projects. */
	context: string;
	href: string;
}

/** Collapse results that are identical in kind, project, label and context. */
function dedupe(results: SearchResult[]): SearchResult[] {
	const seen = new Set<string>();
	return results.filter((r) => {
		const key = `${r.kind}|${r.projectId}|${r.label}|${r.context}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Global search across the whole app: matches projects (by name/description) and
 * components (leaf features across every project's Step 04). Backs the header
 * search box. Capped so the dropdown stays small; query must be >= 2 chars.
 */
export class SearchPortfolioUseCase {
	constructor(
		private readonly catalog: ProjectCatalogPort,
		private readonly loadFeatures: LoadFeaturesDraftUseCase,
		private readonly backLinks: BackLinkRepositoryPort,
		private readonly loadTeam: LoadTeamUseCase,
		private readonly portfolio: PortfolioRepositoryPort,
	) {}

	/**
	 * @param reach what the caller reaches, workspace by workspace; null searches
	 *   everything (auth-off / single operator). Under a reach, only projects of
	 *   the caller's workspaces, each judged by their breadth in ITS workspace
	 *   (domain breadth ∪ collaborations), the same rule as the portfolio.
	 */
	async execute(query: string, reach: CallerReach | null = null): Promise<SearchResult[]> {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];

		const placed = await placeInWorkspaces(await this.catalog.list(), workspaceIdsOf(reach), this.backLinks);
		const projects = await this.#scopeToVisible(placed, reach);

		const projectHits: SearchResult[] = projects
			.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
			.map((p) => ({
				kind: 'project',
				projectId: p.id,
				projectName: p.name,
				label: p.name,
				context: '',
				href: `/projects/${p.id}/scope`,
			}));

		const featureHits: SearchResult[] = [];
		await Promise.all(
			projects.map(async (p) => {
				const features = await this.loadFeatures.execute(p.id);
				for (const leaf of leafFeatures(features)) {
					if (leaf.name.toLowerCase().includes(q)) {
						// Locate the leaf so two same-named features are distinguishable
						// by their core / family path.
						const core = features.cores.find((c) => c.id === leaf.coreId)?.name.trim();
						const family = features.families.find((f) => f.id === leaf.parentFamilyId)?.name.trim();
						const context = [core, family].filter(Boolean).join(' / ');
						featureHits.push({
							kind: 'feature',
							projectId: p.id,
							projectName: p.name,
							label: leaf.name.trim() || '(unnamed feature)',
							context,
							href: `/projects/${p.id}/features`,
						});
					}
				}
			}),
		);

		return [...dedupe(projectHits).slice(0, 8), ...dedupe(featureHits).slice(0, 12)];
	}

	/** Keep only projects visible under the caller's breadth in their own workspace ∪ collaborations. */
	async #scopeToVisible<T extends { readonly id: string }>(
		placed: readonly { readonly item: T; readonly workspaceId: string | null }[],
		reach: CallerReach | null,
	): Promise<T[]> {
		if (reach === null) return placed.map((p) => p.item);
		const keep = await Promise.all(
			placed.map(async ({ item, workspaceId }) => {
				const visibility = visibilityIn(reach, workspaceId);
				if (visibility.allowedDomainIds === null) return true;
				const meta = await this.portfolio.getMeta(item.id).catch(() => null);
				return isProjectVisible(item.id, meta?.domainId ?? null, visibility, (id) =>
					this.loadTeam.execute(id),
				);
			}),
		);
		return placed.filter((_, i) => keep[i]).map((p) => p.item);
	}
}
