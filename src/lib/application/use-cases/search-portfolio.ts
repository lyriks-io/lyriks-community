import { leafFeatures } from '$domain/features';
import type {
	BackLinkRepositoryPort,
	PortfolioRepositoryPort,
	ProjectCatalogPort,
} from '$application/ports';
import { scopeToWorkspace } from '$application/scope-to-workspace';
import { isProjectVisible, type ProjectVisibility } from '$application/project-visibility';
import type { LoadFeaturesDraftUseCase } from './load-features-draft';
import type { LoadTeamUseCase } from './load-team';

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
	 * @param allowedWorkspaceIds when non-null, only search projects mirrored to a
	 *   workspace the caller belongs to (multi-tenant isolation); null searches
	 *   everything (auth-off / MAP).
	 * @param allowedDomainIds domain-scope breadth; null = blanket (no restriction).
	 * @param collaboratorEmail when restricted, also include projects the caller
	 *   collaborates on (per-project grants) — the same union as the portfolio.
	 */
	async execute(
		query: string,
		allowedWorkspaceIds: ReadonlySet<string> | null = null,
		allowedDomainIds: ReadonlySet<string> | null = null,
		collaboratorEmail: string | null = null,
	): Promise<SearchResult[]> {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];

		const workspaceScoped = await scopeToWorkspace(
			await this.catalog.list(),
			allowedWorkspaceIds,
			this.backLinks,
		);
		const projects = await this.#scopeToVisible(workspaceScoped, {
			allowedDomainIds,
			email: collaboratorEmail,
		});

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

	/** Keep only projects visible under the caller's domain breadth ∪ collaborations. */
	async #scopeToVisible<T extends { readonly id: string }>(
		items: readonly T[],
		visibility: ProjectVisibility,
	): Promise<T[]> {
		if (visibility.allowedDomainIds === null) return [...items];
		const keep = await Promise.all(
			items.map(async (item) => {
				const meta = await this.portfolio.getMeta(item.id).catch(() => null);
				return isProjectVisible(item.id, meta?.domainId ?? null, visibility, (id) =>
					this.loadTeam.execute(id),
				);
			}),
		);
		return items.filter((_, i) => keep[i]);
	}
}
