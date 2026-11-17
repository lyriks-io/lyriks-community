import type { Domain } from '$domain/portfolio';
import type { PortfolioRepositoryPort } from '$application/ports';

export interface UpdateDomainResult {
	updated: boolean;
	reason?: string;
}

/** Rename or describe an existing portfolio domain without changing its projects. */
export class UpdateDomainUseCase {
	constructor(private readonly repo: PortfolioRepositoryPort) {}

	async execute(
		id: string,
		name: string,
		description = '',
		icon = 'lucide:building-2'
	): Promise<UpdateDomainResult> {
		const clean = name.trim();
		if (!id) return { updated: false, reason: 'Choose a domain to edit.' };
		if (!clean) return { updated: false, reason: 'Give the domain a name.' };

		const existing = (await this.repo.listDomains()).find((domain) => domain.id === id);
		if (!existing) return { updated: false, reason: 'That domain no longer exists.' };

		const updated: Domain = {
			...existing,
			name: clean,
			description: description.trim(),
			icon: icon.trim() || 'lucide:building-2'
		};
		await this.repo.saveDomain(updated);
		return { updated: true };
	}
}
