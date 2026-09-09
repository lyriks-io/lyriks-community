import { createEmptyGlossaryDraft, type ProjectGlossaryDraft } from '$domain/glossary';
import type { GlossaryDraftRepositoryPort } from '../ports';

/**
 * Loads the persisted Glossary draft, or an empty one. The vocabulary is fully
 * authored here (no upstream mirror), so this is a thin load — the health score
 * and brief-mined suggestions are derived on the client from the corpus the page
 * loader assembles.
 */
export class LoadGlossaryDraftUseCase {
	constructor(private readonly drafts: GlossaryDraftRepositoryPort) {}

	async execute(projectId: string): Promise<ProjectGlossaryDraft> {
		const existing = await this.drafts.load(projectId);
		return existing ?? createEmptyGlossaryDraft(projectId);
	}
}
