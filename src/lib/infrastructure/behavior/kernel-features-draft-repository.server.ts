import type {
	BehaviorPort,
	FeaturesDraftRepositoryPort,
	ProjectResidueRepositoryPort
} from '$application/ports';
import {
	buildFeaturesProjection,
	featuresDraftToBehaviorOps,
	featuresResidueFromDraft,
	type FeaturesResidue
} from '$application/projection/features-projection';
import { isAuxFeatureId } from '$application/projection/aux-feature-ids';
import type { ProjectFeaturesDraft } from '$domain/features';
import type { UnspaFeatureSnapshot, UnspaProjectSnapshot } from '$lib/unspa-schema';

const SECTION = 'features';

/**
 * The Features section, backed by the behavior kernel instead of a draft-as-truth
 * table (Phase 1 of unify-unspa-kernel). Satisfies the same
 * `FeaturesDraftRepositoryPort` every consumer already depends on, so swapping this
 * in at the composition root flips the whole section with no consumer churn:
 *
 *   load  = projection: kernel leaves + membership tags  ⋈  Lyriks residue (decoration)
 *   save  = the ONE write path: BehaviorPort.apply(ops)   +  residue.save
 *
 * The separate sync-features-to-unspaghettit use-case is retired — save writes the
 * kernel directly. A one-shot, idempotent backfill seeds the kernel from the legacy
 * section document on first read so the flip never blanks an existing project.
 */
export class KernelFeaturesDraftRepository implements FeaturesDraftRepositoryPort {
	constructor(
		private readonly behavior: BehaviorPort,
		private readonly residue: ProjectResidueRepositoryPort,
		/** Legacy section store, read once to migrate a pre-kernel project. */
		private readonly legacy: FeaturesDraftRepositoryPort
	) {}

	async load(projectId: string): Promise<ProjectFeaturesDraft | null> {
		let project = await this.behavior.readProject(projectId);
		let leaves = await this.#loadLeaves(projectId, project);

		// First-read migration: an existing project whose kernel is still empty gets
		// seeded from its legacy draft (idempotent — once seeded the kernel is non-empty).
		if (leaves.length === 0) {
			const legacy = await this.legacy.load(projectId);
			if (legacy && legacy.features.length > 0) {
				await this.save(legacy);
				project = await this.behavior.readProject(projectId);
				leaves = await this.#loadLeaves(projectId, project);
			}
		}

		const residue = (await this.residue.load(projectId, SECTION)) as FeaturesResidue | null;
		return buildFeaturesProjection(projectId, { project, features: leaves }, residue);
	}

	async save(draft: ProjectFeaturesDraft): Promise<void> {
		const current = await this.behavior.readProject(draft.projectId);
		const ops = featuresDraftToBehaviorOps(draft, {
			auxFeatureIds: (current?.project.featureIds ?? []).filter(isAuxFeatureId),
			currentProjectTags: current?.project.tags ?? []
		});
		await this.behavior.apply(draft.projectId, ops);
		await this.residue.save(draft.projectId, SECTION, featuresResidueFromDraft(draft));
	}

	/** Load the leaf (non-aux) feature snapshots the projection needs. */
	async #loadLeaves(
		projectId: string,
		project: UnspaProjectSnapshot | null
	): Promise<UnspaFeatureSnapshot[]> {
		const ids = (project?.project.featureIds ?? []).filter((id) => !isAuxFeatureId(id));
		const snaps = await Promise.all(ids.map((id) => this.behavior.readFeature(projectId, id)));
		return snaps.filter((s): s is UnspaFeatureSnapshot => s !== null);
	}
}
