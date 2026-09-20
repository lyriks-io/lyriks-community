import { error } from '@sveltejs/kit';
import { leafFeatures, type ProjectFeaturesDraft } from '$domain/features';
import { featureIdCollisionMessage } from '$application/feature-id-collision';

/** The slice of the container this guard needs, so a test can hand it two stubs. */
export interface LeafIdGuardServices {
	loadFeaturesDraft: { execute(projectId: string): Promise<ProjectFeaturesDraft> };
	detectFeatureIdCollision: {
		execute(projectId: string, featureId: string): Promise<readonly string[]>;
	};
}

/**
 * Refuse a features section that CLAIMS a leaf id another project already holds.
 *
 * The model addresses a feature by id across every project, so two projects
 * declaring the same leaf id share one record. That was already detected, but
 * only when a behavior write addressed the ambiguous id, which is long after the
 * section save created the second copy on disk: the id was taken, the feature
 * unusable, and the only way out was to rename it by hand. A store had reached
 * 133 ids held by several projects that way, with five live projects no longer
 * authorable.
 *
 * Only the leaves this save ADDS are checked. Re-sending the leaves a project
 * already owns is what every autosave does, and each check scans the workspace,
 * so checking them all would make a routine save pay for the whole store.
 *
 * A scan that cannot answer says nothing, exactly as the detector does: a broken
 * read must never turn into a refused save.
 */
export async function assertLeafIdsUnclaimed(
	draft: ProjectFeaturesDraft,
	services: LeafIdGuardServices,
	projectId: string
): Promise<void> {
	const incoming = leafFeatures(draft).map((leaf) => leaf.id);
	if (incoming.length === 0) return;

	let known: ReadonlySet<string>;
	try {
		known = new Set(leafFeatures(await services.loadFeaturesDraft.execute(projectId)).map((l) => l.id));
	} catch {
		return;
	}
	const claimed = incoming.filter((id) => id && !known.has(id));
	if (claimed.length === 0) return;

	for (const featureId of claimed) {
		const holders = await services.detectFeatureIdCollision.execute(projectId, featureId);
		if (holders.length > 0) {
			error(409, featureIdCollisionMessage(projectId, featureId, holders));
		}
	}
}
