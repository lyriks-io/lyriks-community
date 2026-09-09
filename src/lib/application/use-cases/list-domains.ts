import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort } from '$application/ports';

/** List every domain in the portfolio. */
export class ListDomainsUseCase {
	constructor(private readonly repo: PortfolioRepositoryPort) {}

	execute(): Promise<Domain[]> {
		return this.repo.listDomains();
	}
}
