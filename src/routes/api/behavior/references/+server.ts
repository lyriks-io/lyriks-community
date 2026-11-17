import { error, json } from '@sveltejs/kit';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * Every rule, effect, invariant, required state and parameter binding of a
 * feature that reads or writes a state path: what to look at before renaming
 * or removing it.
 *
 *   GET /api/behavior/references?projectId=<id>&featureId=<id>&statePath=<dotted.path>
 */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	const statePath = params.get('statePath') ?? '';
	if (!projectId || !featureId || !statePath)
		error(400, 'projectId, featureId and statePath are required');
	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const answer = await event.locals.services.findStateReferences.execute(featureId, statePath);
	if (!answer) error(503, 'The behavior engine did not answer.');
	if (answer.kind === 'refused') error(404, answer.error);
	return json({ available: true, featureId, statePath, ...answer.value });
};
