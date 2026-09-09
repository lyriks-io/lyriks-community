import type {
	BehaviorPort,
	DataDraftRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	ProjectResidueRepositoryPort
} from '$application/ports';
import { dataModelFeatureId } from '$application/projection/aux-feature-ids';
import {
	buildDataProjection,
	dataDraftToBehaviorOps,
	dataResidueFromDraft,
	type DataResidue
} from '$application/projection/data-projection';
import type { ProjectDataDraft } from '$domain/data';

const SECTION = 'data';

/**
 * The Data section, backed by the behavior kernel instead of a draft-as-truth table
 * (Phase 2 of unify-unspa-kernel). Satisfies the same `DataDraftRepositoryPort`
 * every consumer already depends on, so swapping this in at the composition root
 * flips the whole section with no consumer churn:
 *
 *   load  = projection: the central "Data Model" feature's entities/resources  ⋈
 *           Lyriks residue (infra topology + entity/field attrs)
 *   save  = the ONE write path: BehaviorPort.apply(ops)  +  residue.save
 *
 * The `sync-data-to-unspaghettit` use-case is retired — save writes the kernel
 * directly, including the Core-bridge mirror into consuming leaf features (which is
 * why the adapter needs the definition/experience/features drafts).
 */
export class KernelDataDraftRepository implements DataDraftRepositoryPort {
	constructor(
		private readonly behavior: BehaviorPort,
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly definitionDrafts: FoundationDefinitionRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort,
		private readonly featuresDrafts: FeaturesDraftRepositoryPort
	) {}

	async load(projectId: string): Promise<ProjectDataDraft | null> {
		const dataModel = await this.behavior.readFeature(projectId, dataModelFeatureId(projectId));
		const residue = (await this.residue.load(projectId, SECTION)) as DataResidue | null;
		if (dataModel === null && residue === null) return null; // nothing authored yet
		return buildDataProjection(projectId, dataModel, residue);
	}

	async save(draft: ProjectDataDraft): Promise<void> {
		const [definition, experience, features] = await Promise.all([
			this.definitionDrafts.load(draft.projectId),
			this.experienceDrafts.load(draft.projectId),
			this.featuresDrafts.load(draft.projectId)
		]);
		const ops = dataDraftToBehaviorOps(draft, {
			projectId: draft.projectId,
			definition,
			experience,
			features
		});
		await this.behavior.apply(draft.projectId, ops);
		await this.residue.save(draft.projectId, SECTION, dataResidueFromDraft(draft));
	}
}
