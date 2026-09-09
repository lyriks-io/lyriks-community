import type { Domain } from '$domain/portfolio';

export interface ProjectMeta {
	domainId: string | null;
	/** When a human declared the product shipped (see `setShipped`), else null. */
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
	saveDomain(domain: Domain): Promise<void>;
	removeDomain(id: string): Promise<void>;
	countProjectsInDomain(id: string): Promise<number>;

	getMeta(projectId: string): Promise<ProjectMeta | null>;
	/** Write the org placement only — the shipping declaration is left untouched. */
	setMeta(projectId: string, meta: Pick<ProjectMeta, 'domainId'>): Promise<void>;
	/** Record (or withdraw) the human "this is shipped" declaration. */
	setShipped(projectId: string, shippedAt: string | null): Promise<void>;
	removeMeta(projectId: string): Promise<void>;
}
