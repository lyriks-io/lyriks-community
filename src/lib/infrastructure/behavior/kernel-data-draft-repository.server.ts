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
import type { DataRulesSetup, ProjectDataDraft } from '$domain/data';
import type { SpecLanguage } from '$domain/language';

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
		private readonly featuresDrafts: FeaturesDraftRepositoryPort,
		/**
		 * The language the project's spec is written in, read on each save: the
		 * prose the projection writes into the model follows it. Absent, English.
		 */
		private readonly languageOf?: (projectId: string) => Promise<SpecLanguage>
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
			features,
			lang: (await this.languageOf?.(draft.projectId)) ?? 'en'
		});
		await this.behavior.apply(draft.projectId, ops);
		// The map of the rules Lyriks generated is server-owned: a save keeps the
		// stored one, and only the sync of the rules with the engine rewrites it
		// (saveGeneratedRules), so an engine down at save time never orphans them.
		const previous = (await this.residue.load(draft.projectId, SECTION)) as DataResidue | null;
		const residue = dataResidueFromDraft(draft);
		await this.residue.save(draft.projectId, SECTION, {
			...residue,
			rules: {
				existence: residue.rules?.existence ?? {},
				generated: previous?.rules?.generated ?? {},
				...linkRecordOf(previous)
			}
		});
	}

	/** Record the project invariants the rules sync generated (invariant id to its origin). */
	async saveGeneratedRules(projectId: string, generated: DataRulesSetup['generated']): Promise<void> {
		const previous = (await this.residue.load(projectId, SECTION)) as DataResidue | null;
		if (!previous) return;
		await this.residue.save(projectId, SECTION, {
			...previous,
			rules: { existence: previous.rules?.existence ?? {}, generated, ...linkRecordOf(previous) }
		});
	}

	/** Record who linked each field, the fields a person unlinked, and the further states that carry a field. */
	async saveLinkRecord(projectId: string, record: Pick<DataRulesSetup, 'linkedBy' | 'declined' | 'alsoCarriedBy'>): Promise<void> {
		const previous = (await this.residue.load(projectId, SECTION)) as DataResidue | null;
		if (!previous) return;
		await this.residue.save(projectId, SECTION, {
			...previous,
			rules: {
				existence: previous.rules?.existence ?? {},
				generated: previous.rules?.generated ?? {},
				...(record.linkedBy && Object.keys(record.linkedBy).length > 0 ? { linkedBy: record.linkedBy } : {}),
				...(record.declined && record.declined.length > 0 ? { declined: record.declined } : {}),
				...(record.alsoCarriedBy && Object.keys(record.alsoCarriedBy).length > 0 ? { alsoCarriedBy: record.alsoCarriedBy } : {})
			}
		});
	}
}

/** The server-owned record of the links, kept as it is by a save of the model. */
function linkRecordOf(residue: DataResidue | null): Pick<DataRulesSetup, 'linkedBy' | 'declined' | 'alsoCarriedBy'> {
	const rules = residue?.rules;
	return {
		...(rules?.linkedBy && Object.keys(rules.linkedBy).length > 0 ? { linkedBy: rules.linkedBy } : {}),
		...(rules?.declined && rules.declined.length > 0 ? { declined: rules.declined } : {}),
		...(rules?.alsoCarriedBy && Object.keys(rules.alsoCarriedBy).length > 0 ? { alsoCarriedBy: rules.alsoCarriedBy } : {})
	};
}
