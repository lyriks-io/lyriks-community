import type { DerivedCapability } from '$domain/users';
import { leafFeatures } from '$domain/features';
import { stepsOfJourney } from '$domain/experience';
import { surfaceCapabilities, type LeafSnapshot } from '$application/projection/surface-capabilities';
import { mapLimit } from '$lib/shared/map-limit';
import type {
	BehaviorRepositoryPort,
	ExperienceDraftRepositoryPort,
	FeaturesDraftRepositoryPort,
	UpstreamCapabilityProviderPort
} from '$application/ports';

/** Bound the per-leaf kernel reads behind the surface rows (same cap as the coherence checker). */
const SURFACE_LEAF_CONCURRENCY = 6;

/**
 * Real adapter for `UpstreamCapabilityProviderPort`. Step 04's features draft
 * is the source of truth for the project's leaf-set; Step 05's experience
 * draft is the source of truth for journeys and pages; the behavior kernel
 * holds the remaining surfaces (dialogs, panels, forms). Reads them and
 * projects every leaf / journey-with-a-step / surface into a
 * `DerivedCapability`, so Step 03's permissions matrix can grant roles against
 * them.
 */
export class FeaturesDraftUpstreamProvider implements UpstreamCapabilityProviderPort {
	constructor(
		private readonly drafts: FeaturesDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort,
		private readonly behavior: BehaviorRepositoryPort
	) {}

	async listFeatureCapabilities(projectId: string): Promise<DerivedCapability[]> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		return leafFeatures(draft).map((leaf) => {
			const core = draft.cores.find((c) => c.id === leaf.coreId);
			return {
				id: leaf.id,
				label: leaf.name || '<unnamed feature>',
				source: 'feature' as const,
				sourceRefId: leaf.coreId,
				sourceRefLabel: core?.name || '<unknown core>'
			};
		});
	}

	async listJourneyCapabilities(projectId: string): Promise<DerivedCapability[]> {
		const experience = await this.experienceDrafts.load(projectId);
		if (!experience) return [];
		// Core labels are resolved against Step 04 so the matrix groups journeys
		// by the same stage names the Experience screen shows.
		const features = await this.drafts.load(projectId);
		const coreName = (coreId: string): string =>
			features?.cores.find((c) => c.id === coreId)?.name || '<unknown core>';

		// Only journeys that actually carry a step are real capabilities — an
		// empty journey grants nothing yet.
		return experience.journeys
			.filter((j) => stepsOfJourney(experience, j.id).length > 0)
			.map((j) => ({
				id: j.id,
				label: j.name || '<unnamed journey>',
				source: 'journey' as const,
				sourceRefId: j.coreId,
				sourceRefLabel: coreName(j.coreId)
			}));
	}

	async listSurfaceCapabilities(projectId: string): Promise<DerivedCapability[]> {
		const [features, experience] = await Promise.all([
			this.drafts.load(projectId),
			this.experienceDrafts.load(projectId)
		]);
		const leaves = features ? leafFeatures(features) : [];
		const snapshots: LeafSnapshot[] = await mapLimit(
			leaves,
			SURFACE_LEAF_CONCURRENCY,
			async (leaf) => ({
				id: leaf.id,
				name: leaf.name,
				snapshot: await this.behavior.loadFeature(projectId, leaf.id)
			})
		);
		return surfaceCapabilities(experience, snapshots);
	}

	async listCapabilityIds(projectId: string): Promise<string[]> {
		const [features, journeys, surfaces] = await Promise.all([
			this.listFeatureCapabilities(projectId),
			this.listJourneyCapabilities(projectId),
			this.listSurfaceCapabilities(projectId)
		]);
		return [...features, ...journeys, ...surfaces].map((c) => c.id);
	}
}
