import type { DerivedCapability } from '$domain/users';

/**
 * Seam where Step 03 reads feature-, journey- and surface-derived capabilities
 * from upstream project contexts. The implementation joins the Features and
 * Experience drafts (plus the behavior kernel, for the surfaces that never
 * become a page) so the access matrix follows the live product model.
 */
export interface UpstreamCapabilityProviderPort {
	listFeatureCapabilities(projectId: string): Promise<DerivedCapability[]>;
	listJourneyCapabilities(projectId: string): Promise<DerivedCapability[]>;
	/** Pages, dialogs, panels, forms — everything that carries user input. */
	listSurfaceCapabilities(projectId: string): Promise<DerivedCapability[]>;
	/**
	 * Every derived capability id in one call — the universe the coherence
	 * coverage is scored against. Callers that only need ids skip building the
	 * display rows.
	 */
	listCapabilityIds(projectId: string): Promise<string[]>;
}
