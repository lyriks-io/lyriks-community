import { createEmptyUsersDraft, type ProjectUsersDraft } from '$domain/users';
import type { UsersDraftRepositoryPort } from '../ports';

/** Loads a project's Step 03 draft, or seeds an empty one on first visit. */
export class LoadUsersDraftUseCase {
	constructor(private readonly drafts: UsersDraftRepositoryPort) {}

	async execute(projectId: string): Promise<ProjectUsersDraft> {
		const existing = await this.drafts.load(projectId);
		return existing ?? createEmptyUsersDraft(projectId);
	}
}
