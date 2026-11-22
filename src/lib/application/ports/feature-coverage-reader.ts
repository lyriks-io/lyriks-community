import type { FeatureCodeCoverage } from '$domain/features';

/**
 * What the implementation index located of each feature, keyed by feature id:
 * the only source of whether a feature is built. A feature absent from the map
 * was never located.
 */
export interface FeatureCoverageReaderPort {
	get(projectId: string): Promise<Readonly<Record<string, FeatureCodeCoverage>>>;
}
