import type { DerivedCapability } from '$domain/users';
import type { UpstreamCapabilityProviderPort } from '$application/ports';

/**
 * v0 stub — Steps 04 and 05 aren't authored yet. Returning empty arrays
 * keeps the Step 03 matrix usable while preserving the seam where the real
 * provider will plug in later (read drafts from those steps' repos, project
 * each action/journey into a `DerivedCapability`, group by parent for the UI).
 */
export class StubUpstreamCapabilityProvider implements UpstreamCapabilityProviderPort {
	listFeatureCapabilities(_projectId: string): Promise<DerivedCapability[]> {
		return Promise.resolve([]);
	}

	listJourneyCapabilities(_projectId: string): Promise<DerivedCapability[]> {
		return Promise.resolve([]);
	}

	listSurfaceCapabilities(_projectId: string): Promise<DerivedCapability[]> {
		return Promise.resolve([]);
	}

	listCapabilityIds(_projectId: string): Promise<string[]> {
		return Promise.resolve([]);
	}
}
