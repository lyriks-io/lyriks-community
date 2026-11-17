import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * What the solver says about each rule and statement of one feature, for the
 * Rules tab: one verdict per row. `part=rules` (the default) answers from the
 * rule checks alone, in seconds; `part=statements` from the path search, which
 * takes up to a minute on a large feature. The tab asks them apart from the
 * list, one feature at a time. Read access is enough: nothing is written.
 */
export const GET: RequestHandler = async (event) => {
	// Proof by the solver is an Enterprise capability: elsewhere this route does not exist.
	if (!event.locals.services.proofs) error(404, 'Not found');
	const projectId = event.url.searchParams.get('projectId') ?? '';
	const featureId = event.url.searchParams.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	await requireProjectAccess(event, projectId, 'read');
	const part = event.url.searchParams.get('part') === 'statements' ? 'statements' : 'rules';
	const verdicts = await event.locals.services.proveFeatureRules.execute(projectId, featureId, part);
	if (!verdicts) error(503, 'The behavior engine did not answer.');
	return json(verdicts);
};
