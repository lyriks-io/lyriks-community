import { error, type RequestEvent } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import type { AccessAction } from '$application/ports';
import { dataModelFeatureId, experienceFeatureId } from '$application/projection/aux-feature-ids';
import { requireProjectAccess } from './project-access.server';

/** Authorize a project and prove that a globally-addressed behavior feature belongs to it. */
export async function requireBehaviorFeatureAccess(
	event: Pick<RequestEvent, 'locals' | 'cookies'>,
	projectId: string,
	featureId: string,
	action: AccessAction
): Promise<void> {
	await requireProjectAccess(event, projectId, action);

	const owns =
		featureId === experienceFeatureId(projectId) ||
		featureId === dataModelFeatureId(projectId) ||
		(await getServices().loadFeaturesDraft.execute(projectId)).features.some(
			(feature) => feature.id === featureId
		);
	if (!owns) error(404, 'Feature not found in project');
}

/**
 * Which other projects store the kernel record this feature id addresses.
 *
 * Declaring an id is not the same as owning the record behind it. The engine
 * every write here goes through resolves a feature id across the whole
 * workspace, so when a second project declares the same leaf id, one record
 * answers to both: the batch lands wherever the engine indexed it, and the
 * project that asked keeps reading its own folder, sees nothing authored, and
 * blocks on `capability-behavior-missing` with nothing naming the cause.
 *
 * Left to the caller to report, because the right shape differs: an authoring
 * batch answers 200 with a rejected batch the leaf drawer already renders,
 * while the MCP-only endpoints answer 409. A caller that reports this as an
 * opaque HTTP error on the drawer's path would replace a precise, actionable
 * message with "The change was rejected."
 *
 * Reads are never checked: they are served from this project's own folder, so
 * an ambiguous id shows an empty feature rather than a stranger's, and refusing
 * them would blank a page that works.
 */
export async function featureIdCollisions(
	projectId: string,
	featureId: string
): Promise<readonly string[]> {
	return getServices().detectFeatureIdCollision.execute(projectId, featureId);
}

/** What to tell whoever hit the clash, in one sentence they can act on. */
export function featureIdCollisionMessage(
	projectId: string,
	featureId: string,
	clashes: readonly string[]
): string {
	return (
		`Feature id "${featureId}" is also stored by ${clashes.join(', ')}. ` +
		'The behavior engine addresses features by id across all projects, so this write would land ' +
		'in whichever copy it indexed. Give this leaf an id unique to its project (for example ' +
		`"${projectId.slice(0, 12)}-${featureId}") and author it under that id.`
	);
}
