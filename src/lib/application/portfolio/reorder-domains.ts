import type { PortfolioRepositoryPort } from '$application/ports';

export interface ReorderDomainsResult {
	reordered: boolean;
	reason?: string;
}

/** The refusal of a reorder that is not the list of folders as it stands (rule a20195a8). */
export const REORDER_OUTSIDE_LIST = 'A folder is dropped among the folders';

/**
 * Put the folders of the projects in a new order (action 5ccc378f, criterion
 * ddf5cc35): `ids` is every domain, top to bottom, as the drag left them, and
 * each one is saved at its index for everyone. The list must be the folders
 * exactly, each once (rule a20195a8): a drop computed from a stale list, which
 * misses a folder created since or names one deleted since, changes nothing.
 * No folder (the projects filed nowhere) is no domain, so it is never in the
 * list and always reads last. Who may reorder (rule 8f68eccd) is the edge's
 * check: only a member who sees every folder.
 */
export class ReorderDomainsUseCase {
	constructor(private readonly repo: PortfolioRepositoryPort) {}

	/**
	 * @param workspaceIds the caller's workspaces, whose folders the order names
	 *   (another team's folders are never theirs to place, issue 156); null names
	 *   every folder (an installation with nothing to scope).
	 */
	async execute(ids: readonly string[], workspaceIds: ReadonlySet<string> | null = null): Promise<ReorderDomainsResult> {
		const domains = await this.repo.listDomains();
		const theirs = workspaceIds === null ? domains : domains.filter((d) => !!d.workspaceId && workspaceIds.has(d.workspaceId));
		const known = new Set(theirs.map((d) => d.id));
		const sent = new Set(ids);
		const sameFolders = sent.size === ids.length && sent.size === known.size && ids.every((id) => known.has(id));
		if (!sameFolders) return { reordered: false, reason: REORDER_OUTSIDE_LIST };
		await this.repo.setDomainOrder(ids);
		return { reordered: true };
	}
}
