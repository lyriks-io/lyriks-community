/**
 * Ids + predicate for the auxiliary Unspaghettit features Lyriks generates into a
 * project workspace: the central "Data Model" feature (every entity + resource) and
 * the "Experience" feature (surfaces/actions/transitions). They are NOT Step-04
 * leaves, so the Features projection preserves them in the project's `featureIds[]`
 * rather than treating them as leaf shells.
 *
 * Relocated here from the (being-retired) `sync-*-to-unspaghettit` use-cases so the
 * kernel adapters — Features, Data, and later Experience — can share one definition
 * without importing a use-case. Pure, framework-free.
 */
export function dataModelFeatureId(projectId: string): string {
	return `${projectId}__data_model`;
}

export function experienceFeatureId(projectId: string): string {
	return `${projectId}__experience`;
}

export function isAuxFeatureId(id: string): boolean {
	return id.endsWith('__data_model') || id.endsWith('__experience');
}
