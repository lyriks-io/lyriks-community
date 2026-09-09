import { createEmptyFeaturesDraft, type ProjectFeaturesDraft } from '$domain/features';
import type { FeaturesDraftRepositoryPort } from '../ports';

export class LoadFeaturesDraftUseCase {
	constructor(private readonly drafts: FeaturesDraftRepositoryPort) {}

	async execute(projectId: string): Promise<ProjectFeaturesDraft> {
		const existing = await this.drafts.load(projectId);
		return existing ?? createEmptyFeaturesDraft(projectId);
	}
}
