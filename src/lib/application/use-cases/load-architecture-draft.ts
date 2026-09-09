import {
	createEmptyArchitectureDraft,
	withStableArchitectureIds,
	type ProjectArchitectureDraft
} from '$domain/architecture';
import type {
	ArchitectureDraftRepositoryPort,
	DataDraftRepositoryPort,
	FoundationDefinitionRepositoryPort
} from '../ports';
import { buildDerivedTech } from '../build-derived-tech';

/**
 * Loads the persisted Step 08 draft (or an empty one) and refreshes its
 * read-only `derivedTech` from Step 02 (stack/integrations) and Step 07
 * (infra). Recomputed on every load so the seed always mirrors upstream.
 *
 * Also completes the reference-doc migration: Architecture no longer owns a
 * private doc list, so every legacy `referenceDocs` row is adopted as a citation
 * (same id). The register fold publishes the row itself, this publishes the link
 * — together they make an old project look exactly as it did, sourced from the
 * one register. Idempotent: ids are deduped, so it converges after one save.
 */
export class LoadArchitectureDraftUseCase {
	constructor(
		private readonly drafts: ArchitectureDraftRepositoryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly dataDrafts: DataDraftRepositoryPort
	) {}

	async execute(projectId: string): Promise<ProjectArchitectureDraft> {
		const [existing, definition, data] = await Promise.all([
			this.drafts.load(projectId),
			this.definitionDrafts.load(projectId),
			this.dataDrafts.load(projectId)
		]);
		const draft = existing ?? createEmptyArchitectureDraft(projectId);
		return withStableArchitectureIds({
			...draft,
			sourceIds: [...new Set([...draft.sourceIds, ...draft.referenceDocs.map((doc) => doc.id)])],
			derivedTech: buildDerivedTech(definition, data)
		});
	}
}
