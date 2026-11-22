/**
 * Whether a feature is built, read from the code and never written by hand:
 * the share of its specification the implementation index locates. Every
 * element located is done, some is in progress, none is not started.
 */
export type FeatureBuildStatus = 'not-started' | 'in-progress' | 'done';

/** What the last sync of the implementation index located of one feature. */
export interface FeatureCodeCoverage {
	readonly found: number;
	readonly expected: number;
}

export function buildStatusOf(coverage: FeatureCodeCoverage | undefined): FeatureBuildStatus {
	if (!coverage || coverage.found <= 0) return 'not-started';
	return coverage.expected > 0 && coverage.found >= coverage.expected ? 'done' : 'in-progress';
}

/** The build status of every feature id given, from the coverage recorded per feature. */
export function buildStatusByFeature(
	featureIds: readonly string[],
	coverage: Readonly<Record<string, FeatureCodeCoverage>>
): Record<string, FeatureBuildStatus> {
	return Object.fromEntries(featureIds.map((id) => [id, buildStatusOf(coverage[id])]));
}
