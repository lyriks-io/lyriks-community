import type { DerivedCapability } from '$domain/users';
import type { UpstreamCapabilityProviderPort } from '../ports';

export interface DerivedCapabilitiesSnapshot {
	readonly features: DerivedCapability[];
	readonly journeys: DerivedCapability[];
	/** Pages, dialogs, panels, forms — anything that carries user input. */
	readonly surfaces: DerivedCapability[];
}

/**
 * Pulls the current set of feature-derived and journey-derived capabilities
 * from the upstream provider. In v0 the stub provider returns empty arrays;
 * once Steps 04 and 05 are authored, swapping the adapter in the composition
 * root makes the matrix populate automatically. Implements the spec's
 * `Refresh Derived Capabilities` action on feature `33b2f79d`.
 */
export class RefreshDerivedCapabilitiesUseCase {
	constructor(private readonly upstream: UpstreamCapabilityProviderPort) {}

	async execute(projectId: string): Promise<DerivedCapabilitiesSnapshot> {
		const [features, journeys, surfaces] = await Promise.all([
			this.upstream.listFeatureCapabilities(projectId),
			this.upstream.listJourneyCapabilities(projectId),
			this.upstream.listSurfaceCapabilities(projectId)
		]);
		return { features, journeys, surfaces };
	}
}
