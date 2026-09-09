import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/** Full canonical feature snapshot, including every stable child id needed by later batches. */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const featureId = event.url.searchParams.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const snapshot = await getServices().readBehaviorFeature.execute(projectId, featureId);
	if (!snapshot) error(404, 'Behavior feature not found');
	return json({ snapshot });
};
