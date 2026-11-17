import type { DerivedCapability } from '$domain/users';
import { leafFeatures } from '$domain/features';
import { stepsOfJourney } from '$domain/experience';
import { surfaceCapabilities, type LeafSnapshot } from '$application/projection/surface-capabilities';
import { featureActionCapabilities } from '$application/projection/action-capabilities';
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
	private readonly inFlight = new Map<string, Promise<LeafSnapshot[]>>();

	constructor(
		private readonly drafts: FeaturesDraftRepositoryPort,
		private readonly experienceDrafts: ExperienceDraftRepositoryPort,
		private readonly behavior: BehaviorRepositoryPort
	) {}

	/** One row per action each leaf feature declares; a leaf with none keeps its own row. */
	async listFeatureCapabilities(projectId: string): Promise<DerivedCapability[]> {
		const draft = await this.drafts.load(projectId);
		if (!draft) return [];
		const snapshots = await this.leafSnapshots(projectId);
		const snapshotOf = new Map(snapshots.map((s) => [s.id, s.snapshot]));
		return featureActionCapabilities(
			leafFeatures(draft).map((leaf) => ({
				id: leaf.id,
				name: leaf.name,
				coreId: leaf.coreId,
				coreName: draft.cores.find((c) => c.id === leaf.coreId)?.name || '<unknown core>',
				snapshot: snapshotOf.get(leaf.id) ?? null
			}))
		);
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
		const [snapshots, experience] = await Promise.all([
			this.leafSnapshots(projectId),
			this.experienceDrafts.load(projectId)
		]);
		return surfaceCapabilities(experience, snapshots);
	}

	/**
	 * The kernel snapshot of every leaf. Both the action rows and the surface
	 * rows read it, usually in the same request, so a read already in flight
	 * for the project is shared instead of hitting the kernel twice per leaf.
	 */
	private leafSnapshots(projectId: string): Promise<LeafSnapshot[]> {
		const pending = this.inFlight.get(projectId);
		if (pending) return pending;
		const read = this.readLeafSnapshots(projectId).finally(() => this.inFlight.delete(projectId));
		this.inFlight.set(projectId, read);
		return read;
	}

	private async readLeafSnapshots(projectId: string): Promise<LeafSnapshot[]> {
		const features = await this.drafts.load(projectId);
		const leaves = features ? leafFeatures(features) : [];
		return mapLimit(leaves, SURFACE_LEAF_CONCURRENCY, async (leaf) => ({
			id: leaf.id,
			name: leaf.name,
			snapshot: await this.behavior.loadFeature(projectId, leaf.id)
		}));
	}

	/**
	 * Coverage is scored per feature, like the Control Center: a feature is one
	 * id here even though the matrix grants it action by action.
	 */
	async listCapabilityIds(projectId: string): Promise<string[]> {
		const [features, journeys, surfaces] = await Promise.all([
			this.drafts.load(projectId),
			this.listJourneyCapabilities(projectId),
			this.listSurfaceCapabilities(projectId)
		]);
		const leafIds = features ? leafFeatures(features).map((leaf) => leaf.id) : [];
		return [...leafIds, ...[...journeys, ...surfaces].map((c) => c.id)];
	}
}
