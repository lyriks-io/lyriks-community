import { type ProjectExperienceDraft } from '$domain/experience';
import { parseExperienceDraft } from '../parse-experience-draft';
import type { ExperienceDraftRepositoryPort, FeaturesDraftRepositoryPort } from '../ports';

/**
 * Loads the persisted Step 05 draft (or an empty one) and refreshes its
 * read-only `derivedCores` mirror from the current Step 04 feature tree. The
 * macro stages of the experience flow ARE the Step 04 Cores, so we recompute
 * them on every load — they are never authored in Step 05. Journeys whose Core
 * was deleted upstream keep their `coreId` (orphaned) but no longer render
 * under a stage; the UI surfaces them so the author can re-home or drop them.
 */
export class LoadExperienceDraftUseCase {
	constructor(
		private readonly drafts: ExperienceDraftRepositoryPort,
		private readonly featuresDrafts: FeaturesDraftRepositoryPort
	) {}

	async execute(projectId: string): Promise<ProjectExperienceDraft> {
		// Normalize through the anti-corruption parser so drafts saved before a
		// schema addition (e.g. `builder`) always load with the full, valid shape
		// — and legacy prototype content migrates into the builder on first load.
		const existing = parseExperienceDraft(await this.drafts.load(projectId), projectId);
		const features = await this.featuresDrafts.load(projectId);

		// Only leaf-bearing Cores plus any Core that already hosts a journey count
		// as a macro stage. We mirror every Core from Step 04 (order by insertion).
		const derivedCores = (features?.cores ?? []).map((core, i) => ({
			id: core.id,
			name: core.name || '<unnamed core>',
			order: i,
			tone: core.tone,
			sourceRefId: core.id
		}));

		return { ...existing, derivedCores };
	}
}
