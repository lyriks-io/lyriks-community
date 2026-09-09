import type { ClockPort, PortfolioRepositoryPort } from '$application/ports';

export interface MarkProjectShippedInput {
	projectId: string;
	/** True to declare the product shipped, false to withdraw that declaration. */
	shipped: boolean;
}

export interface MarkProjectShippedResult {
	updated: boolean;
	reason?: string;
}

/**
 * Record the human "this product is shipped" call. Every other delivery stage is
 * derived from the spec (see `deriveProjectStage`), but shipping is a fact about
 * the world that no score, completion gate or agent can establish — so it has
 * one writer: a person acting from the portfolio. Deliberately NOT reachable
 * from the project API, and therefore not from the MCP tools an assistant drives.
 */
export class MarkProjectShippedUseCase {
	constructor(
		private readonly portfolio: PortfolioRepositoryPort,
		private readonly clock: ClockPort
	) {}

	async execute(input: MarkProjectShippedInput): Promise<MarkProjectShippedResult> {
		if (!input.projectId) return { updated: false, reason: 'Choose a project first.' };
		await this.portfolio.setShipped(input.projectId, input.shipped ? this.clock.nowIso() : null);
		return { updated: true };
	}
}
