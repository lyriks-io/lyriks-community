import { json } from '@sveltejs/kit';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * The summary of one action, as the engine projects it from the model: the
 * digest a feature shows for itself, scoped to the action. `digest` is null
 * when the engine is unreachable.
 *
 * Authorization: the behavior endpoints' gate; the caller must read
 * `projectId` and the feature must belong to it.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const featureId = url.searchParams.get('featureId') ?? '';
	const surfaceId = url.searchParams.get('surfaceId') ?? '';
	const actionId = url.searchParams.get('actionId') ?? '';
	if (!projectId || !featureId || !surfaceId || !actionId)
		return json({ digest: null }, { status: 400 });

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');

	const digest = await event.locals.services.readActionDigest.execute(featureId, surfaceId, actionId);
	return json({ digest });
};
