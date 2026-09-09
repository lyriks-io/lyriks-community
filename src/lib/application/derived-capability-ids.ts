import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import { stepsOfJourney, type ProjectExperienceDraft } from '$domain/experience';
import { screenCapabilities } from './projection/surface-capabilities';

/**
 * The feature/journey/surface capability ids the permissions matrix (Step 03)
 * shows but the Users domain can't read on its own — every leaf feature, every
 * journey that carries at least one step, and every page of the Experience
 * draft. Shared by the global coherence checker and the users-section save
 * use-case so both score the SAME capability universe; scoring the matrix
 * without these (as the section save used to) reports a lower coverage number
 * than the dashboard's coherence dimension for identical data.
 *
 * Surfaces that live only in the behavior kernel (dialogs, panels, forms) can't
 * be read from these two drafts — callers that hold the leaf snapshots pass
 * their ids in as `kernelSurfaceIds` so their universe still matches the
 * matrix's. Omitting them narrows the universe, never corrupts it.
 *
 * Null-tolerant: a project without a features/experience draft yet contributes no
 * derived capabilities rather than crashing the coverage computation.
 */
export function derivedCapabilityIds(
	features: ProjectFeaturesDraft | null,
	experience: ProjectExperienceDraft | null,
	kernelSurfaceIds: readonly string[] = []
): string[] {
	const featureCaps = features ? leafFeatures(features).map((f) => f.id) : [];
	const journeyCaps = experience
		? experience.journeys
				.filter((j) => stepsOfJourney(experience, j.id).length > 0)
				.map((j) => j.id)
		: [];
	const screenCaps = screenCapabilities(experience).map((c) => c.id);
	return [...featureCaps, ...journeyCaps, ...screenCaps, ...kernelSurfaceIds];
}
