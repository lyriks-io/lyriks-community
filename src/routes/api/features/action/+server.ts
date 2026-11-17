import { json } from '@sveltejs/kit';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { summarizeAction } from '$application/specification/summarize-action';
import type { RequestHandler } from './$types';

/**
 * One action of a leaf feature as its details panel lists it: parameters,
 * states read and written, events, transitions and scenarios, folded from the
 * persisted kernel snapshot. No engine run, so it answers at once and offline.
 *
 * Authorization: the behavior endpoints' gate; the caller must read
 * `projectId` and the feature must belong to it.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const projectId = url.searchParams.get('projectId') ?? '';
	const featureId = url.searchParams.get('featureId') ?? '';
	const actionId = url.searchParams.get('actionId') ?? '';
	if (!projectId || !featureId || !actionId) return json({ action: null }, { status: 400 });

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');

	const snapshot = await event.locals.services.behaviorPort.readFeature(projectId, featureId);
	return json({ action: summarizeAction(snapshot, actionId) });
};
