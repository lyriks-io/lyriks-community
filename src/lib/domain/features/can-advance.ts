import { leafFeatures } from './tree';
import type { ProjectFeaturesDraft } from './draft';

/**
 * Minimum bar to unlock Step 05: at least one Core, at least one leaf Feature.
 * Mirrors the feature invariant on `1e95b087`.
 */
export function featuresCanAdvance(draft: ProjectFeaturesDraft): boolean {
	return missingFeaturesRequirements(draft).length === 0;
}

export function missingFeaturesRequirements(draft: ProjectFeaturesDraft): string[] {
	const missing: string[] = [];
	if (draft.cores.length === 0) missing.push('one Core');
	if (leafFeatures(draft).length === 0) missing.push('one leaf Feature');
	return missing;
}
