import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess, featureIdCollisions, featureIdCollisionMessage } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null);
	if (!body || ['projectId', 'featureId', 'surfaceId', 'stateDefinitionId'].some((k) => typeof body[k] !== 'string' || !body[k]))
		error(400, 'projectId, featureId, surfaceId and stateDefinitionId are required');
	const { projectId, featureId, surfaceId, stateDefinitionId } = body;
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	const clashes = await featureIdCollisions(projectId, featureId);
	if (clashes.length) error(409, featureIdCollisionMessage(projectId, featureId, clashes));
	const services = getServices();
	const result = await services.deleteBehaviorState.execute({ projectId, featureId, surfaceId, stateDefinitionId });
	if (result.ok) void services.scheduleBackSync(projectId).catch(() => {});
	return json(result);
};
