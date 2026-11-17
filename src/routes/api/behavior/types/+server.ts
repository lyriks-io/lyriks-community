import { error, json } from '@sveltejs/kit';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * The TypeScript module mirroring a feature, returned as source: the
 * repository saves it, and its code stops compiling when the model changes.
 *
 *   GET /api/behavior/types?projectId=<id>&featureId=<id>
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const featureId = event.url.searchParams.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const answer = await event.locals.services.generateBehaviorTypes.execute(featureId);
	if (!answer) error(503, 'The behavior engine did not answer.');
	if (answer.kind === 'refused') error(404, answer.error);
	return json({ available: true, featureId, ...answer.value });
};
