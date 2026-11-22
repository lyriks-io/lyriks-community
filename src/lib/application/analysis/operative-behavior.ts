import { operativeSnapshotFeature, type UnspaFeatureSnapshot } from '$lib/unspa-schema';
import type { BehaviorRepositoryPort } from '../ports';

/**
 * The behaviour model as the coherence check reads it: each feature without
 * its disabled elements, like every reading of the engine (the operative
 * model). A disabled element counts in no reading; the pages that show the
 * model as written read the repository itself.
 */
export function operativeBehavior(
	models: Pick<BehaviorRepositoryPort, 'loadProject' | 'loadFeature'>
): Pick<BehaviorRepositoryPort, 'loadProject' | 'loadFeature'> {
	return {
		loadProject: (projectId) => models.loadProject(projectId),
		loadFeature: async (projectId, featureId) => {
			const snapshot = await models.loadFeature(projectId, featureId);
			return snapshot ? operativeSnapshot(snapshot) : snapshot;
		}
	};
}

function operativeSnapshot(snapshot: UnspaFeatureSnapshot): UnspaFeatureSnapshot {
	const feature = operativeSnapshotFeature(snapshot.feature);
	return feature === snapshot.feature ? snapshot : { ...snapshot, feature };
}
