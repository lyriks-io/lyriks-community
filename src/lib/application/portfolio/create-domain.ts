import { mintUuid } from '$domain/shared';
import { makeDomainId, type Domain } from '$domain/portfolio';
import type { ClockPort, PortfolioRepositoryPort } from '$application/ports';

/** Create a custom-named domain to group projects. */
export class CreateDomainUseCase {
	constructor(
		private readonly repo: PortfolioRepositoryPort,
		private readonly clock: ClockPort,
		private readonly randomSuffix: () => string = () => mintUuid().slice(0, 6)
	) {}

	/** `workspaceId` is the workspace the folder belongs to (null without workspaces). */
	async execute(name: string, description = '', icon = 'lucide:building-2', workspaceId: string | null = null): Promise<Domain> {
		const clean = name.trim() || 'Untitled domain';
		const domain: Domain = {
			id: makeDomainId(clean, this.randomSuffix()),
			name: clean,
			description: description.trim(),
			icon: icon.trim() || 'lucide:building-2',
			createdAt: this.clock.nowIso(),
			workspaceId
		};
		await this.repo.saveDomain(domain);
		return domain;
	}
}
