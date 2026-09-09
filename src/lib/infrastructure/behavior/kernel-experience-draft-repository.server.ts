import type {
	BehaviorPort,
	DataDraftRepositoryPort,
	ExperienceDraftRepositoryPort,
	ExperienceSaveReport,
	FeaturesDraftRepositoryPort,
	FoundationDefinitionRepositoryPort,
	ProjectResidueRepositoryPort,
	UsersDraftRepositoryPort
} from '$application/ports';
import { experienceFeatureId } from '$application/projection/aux-feature-ids';
import { dataMirrorOps } from '$application/projection/data-projection';
import {
	buildExperienceProjection,
	experienceDraftToBehaviorOps,
	experienceResidueFromDraft,
	type DeclaredState,
	type ExperienceResidue
} from '$application/projection/experience-projection';
import type { ProjectExperienceDraft } from '$domain/experience';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import type { UnspaFeatureSnapshot } from '$lib/unspa-schema';

const SECTION = 'experience';

/**
 * The Experience section (Step 05), backed by the behavior kernel instead of a
 * draft-as-truth table (Phase 4 of unify-unspa-kernel). Satisfies the same
 * `ExperienceDraftRepositoryPort` every consumer depends on, so swapping it in at
 * the composition root flips the section with no consumer churn:
 *
 *   load  = residue (the authored builder/journeys/library/brand)  ⋈  the kernel's
 *           journey layer overlaid on top, so journeys/steps/transitions authored in
 *           unspa round-trip into the page (two-way binding)
 *   save  = the ONE write path: BehaviorPort.apply(ops)  +  residue.save
 *
 * The `sync-experience-to-unspaghettit` use-case is retired — save projects the
 * behavior graph itself, MAP-native (engines off), including the Core-bridge mirror
 * into consuming leaf features (which is why it needs the features/users drafts:
 * actor-roles → personas, and the leaf mirror). A one-shot, idempotent backfill
 * seeds the residue + kernel from the legacy section document on first read.
 */
export class KernelExperienceDraftRepository implements ExperienceDraftRepositoryPort {
	constructor(
		private readonly behavior: BehaviorPort,
		private readonly residue: ProjectResidueRepositoryPort,
		private readonly featuresDrafts: FeaturesDraftRepositoryPort,
		private readonly usersDrafts: UsersDraftRepositoryPort,
		/** Legacy section store, read once to migrate a pre-kernel project. */
		private readonly legacy: ExperienceDraftRepositoryPort,
		/**
		 * The Core-bridge mirror keys consuming leaves off this draft's
		 * `stepDataReads`, so an Experience-only save must re-mirror too — the Data
		 * save is no longer the sole trigger. The data draft is read lazily because
		 * `KernelDataDraftRepository` is constructed after this repo (it reads us),
		 * and both deps are optional so a wiring without them just skips the extra
		 * mirror.
		 */
		private readonly dataFor?: () => DataDraftRepositoryPort | null,
		private readonly definitionDrafts?: FoundationDefinitionRepositoryPort
	) {}

	async load(projectId: string): Promise<ProjectExperienceDraft | null> {
		let residue = (await this.residue.load(projectId, SECTION)) as ExperienceResidue | null;

		// First-read migration: an existing project with authored content but no residue
		// yet gets seeded from its legacy draft (idempotent once the residue exists).
		if (residue === null) {
			const legacy = await this.legacy.load(projectId);
			if (legacy && hasAuthoredContent(legacy)) {
				await this.save(legacy);
				residue = (await this.residue.load(projectId, SECTION)) as ExperienceResidue | null;
			}
		}

		const feature = await this.behavior.readFeature(projectId, experienceFeatureId(projectId));
		// Nothing authored in Lyriks AND no journeys authored purely in unspa → empty.
		if (residue === null && !hasWorkflowSurfaces(feature)) return null;
		return buildExperienceProjection(projectId, residue, feature);
	}

	async save(draft: ProjectExperienceDraft): Promise<ExperienceSaveReport> {
		const [features, users] = await Promise.all([
			this.featuresDrafts.load(draft.projectId),
			this.usersDrafts.load(draft.projectId)
		]);
		const declaredStates = await this.#declaredStates(draft.projectId, features);
		const ops = experienceDraftToBehaviorOps(draft, { features, users, declaredStates });

		// Fix #5: re-mirror consuming leaves off THIS draft's stepDataReads, so editing
		// what a step reads and saving only Experience enriches the leaves right away
		// (previously this only ran on Data save). Reuse the same projection the data
		// save uses — with the same definition enrichment — so it never churns its output.
		const data = (await this.dataFor?.()?.load(draft.projectId)) ?? null;
		if (data) {
			const definition = (await this.definitionDrafts?.load(draft.projectId)) ?? null;
			ops.push(...dataMirrorOps(data, draft, features, definition));
		}

		const report = await this.behavior.apply(draft.projectId, ops);
		await this.residue.save(draft.projectId, SECTION, experienceResidueFromDraft(draft));
		return { behaviorWarnings: report.warnings };
	}

	/**
	 * The type each state path is declared with by the project's leaf features,
	 * first declaration winning (the rule the back's graph compiler applies when
	 * it types the shared state bus). The projection types simulator seeds from
	 * it, so the Experience mirror never redeclares a state with a type of its own.
	 */
	async #declaredStates(
		projectId: string,
		features: ProjectFeaturesDraft | null
	): Promise<Map<string, DeclaredState>> {
		const declared = new Map<string, DeclaredState>();
		if (!features) return declared;
		for (const leaf of leafFeatures(features)) {
			const snapshot = await this.behavior.readFeature(projectId, leaf.unspaghettitFeatureId || leaf.id);
			const surfaces = (snapshot?.feature as { surfaces?: unknown } | undefined)?.surfaces;
			if (!Array.isArray(surfaces)) continue;
			for (const surface of surfaces as { stateDefinitions?: unknown }[]) {
				if (!Array.isArray(surface.stateDefinitions)) continue;
				for (const def of surface.stateDefinitions as { path?: unknown; type?: unknown; enumValues?: unknown }[]) {
					if (typeof def.path !== 'string' || typeof def.type !== 'string' || declared.has(def.path)) continue;
					declared.set(def.path, {
						type: def.type,
						...(Array.isArray(def.enumValues) ? { enumValues: def.enumValues.map(String) } : {})
					});
				}
			}
		}
		return declared;
	}
}

/** Whether the legacy draft carries anything worth migrating (avoid seeding empties). */
function hasAuthoredContent(draft: ProjectExperienceDraft): boolean {
	return (
		draft.journeys.length > 0 ||
		draft.screens.length > 0 ||
		Object.keys(draft.builder?.screenRoots ?? {}).length > 0
	);
}

/** Whether the kernel already holds journeys (workflow surfaces) authored in unspa. */
function hasWorkflowSurfaces(feature: UnspaFeatureSnapshot | null): boolean {
	const surfaces = (feature?.feature as { surfaces?: { type?: string }[] } | undefined)?.surfaces;
	return Array.isArray(surfaces) && surfaces.some((s) => s.type === 'workflow');
}
