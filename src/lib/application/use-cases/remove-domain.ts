import type { PortfolioRepositoryPort } from '$application/ports';

export interface RemoveDomainResult {
	removed: boolean;
	reason?: string;
}

/** Remove a domain — only when it has no projects (the mockup's business rule). */
export class RemoveDomainUseCase {
	constructor(private readonly repo: PortfolioRepositoryPort) {}

	async execute(id: string): Promise<RemoveDomainResult> {
		const count = await this.repo.countProjectsInDomain(id);
		if (count > 0) {
			return { removed: false, reason: `Move or delete its ${count} project(s) first.` };
		}
		await this.repo.removeDomain(id);
		return { removed: true };
	}
}
