import type { Domain } from '$domain/portfolio';

export interface ProjectMeta {
	domainId: string | null;
	/**
	 * When a person once declared the product shipped, else null. Read only: the
	 * portfolio no longer offers the declaration, so nothing writes it any more.
	 */
	shippedAt: string | null;
}

/**
 * Outbound port for the portfolio's org layer: the Domains registry and each
 * project's org metadata (which domain, and whether a person declared it
 * shipped). Wizard step data is untouched — these two tables sit alongside it.
 * The pre-ship stages are NOT stored: they are derived from the live signals
 * (see `deriveProjectStage`).
 */
export interface PortfolioRepositoryPort {
	listDomains(): Promise<Domain[]>;
	/** Upsert a domain's name, description and icon; its position is kept as stored (a new one has none). */
	saveDomain(domain: Domain): Promise<void>;
	/** Place every domain at its index in `ids` (0 at the top), all in one write (action 5ccc378f). */
	setDomainOrder(ids: readonly string[]): Promise<void>;
	removeDomain(id: string): Promise<void>;
	countProjectsInDomain(id: string): Promise<number>;

	getMeta(projectId: string): Promise<ProjectMeta | null>;
	/** Write the org placement only — the shipping declaration is left untouched. */
	setMeta(projectId: string, meta: Pick<ProjectMeta, 'domainId'>): Promise<void>;
	removeMeta(projectId: string): Promise<void>;
}
