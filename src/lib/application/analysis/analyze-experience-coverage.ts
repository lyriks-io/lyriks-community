import { analyzeCoverage, type CoverageReport } from '$domain/experience';
import type { SpecLanguage } from '$domain/language';
import type { LoadExperienceDraftUseCase } from '../specification/load-experience-draft';
import type { LoadUsersDraftUseCase } from '../specification/load-users-draft';
import type { LoadDataDraftUseCase } from '../specification/load-data-draft';

/**
 * Step-05 plan-coverage / readiness analysis as a use-case: load the experience
 * draft plus the Step-03 roles and Step-07 entity names it cross-checks against,
 * then run the pure {@link analyzeCoverage} domain function. The Experience tab
 * already shows this; exposing it as a use-case lets the MCP serve the same
 * report so an AI can author → read gaps → patch the exact screen/element,
 * instead of pulling the whole draft and re-deriving completeness itself.
 */
export class AnalyzeExperienceCoverageUseCase {
	constructor(
		private readonly loadExperience: LoadExperienceDraftUseCase,
		private readonly loadUsers: LoadUsersDraftUseCase,
		private readonly loadData: LoadDataDraftUseCase
	) {}

	async execute(projectId: string, lang: SpecLanguage = 'en'): Promise<CoverageReport> {
		const [draft, users, data] = await Promise.all([
			this.loadExperience.execute(projectId),
			this.loadUsers.execute(projectId),
			this.loadData.execute(projectId)
		]);
		return analyzeCoverage(draft, {
			roles: users.roles.map((r) => ({ id: r.id, name: r.name })),
			entityNames: data.entities.map((e) => e.name)
		}, lang);
	}
}
