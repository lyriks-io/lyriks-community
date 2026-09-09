import { json, error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * Full Unspaghettit assessment for a single leaf feature — named behavior
 * (surfaces / actions / scenarios), maturity, executable-scenario results,
 * model-check reachability, spec gaps and the gated verdict, as the engine sees
 * them. Fetched on demand when the leaf drawer opens (one feature at a time,
 * unlike the bulk score endpoint). The response keeps the legacy `behavior`
 * field so older callers keep working, and degrades to `available:false` /
 * nulls when the engine is unreachable (the drawer then shows the fallback copy).
 *
 * Authorization: the engine resolves a feature by id across the whole workspace,
 * so the caller must scope the request to a project AND the feature must belong
 * to it — otherwise an authenticated user could read any project's behavior by
 * guessing feature ids. We gate on read access to `projectId` and reject a
 * feature that isn't one of that project's own.
 */
export const GET: RequestHandler = async (event) => {
	const { url } = event;
	const featureId = url.searchParams.get('featureId') ?? '';
	const projectId = url.searchParams.get('projectId') ?? '';
	if (!featureId || !projectId)
		return json({ available: false, behavior: null, assessment: null }, { status: 400 });

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');

	const services = getServices();
	const assessment = await services.assessFeature.execute(featureId);
	return json({ available: assessment.available, behavior: assessment.behavior, assessment });
};
