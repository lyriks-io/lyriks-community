import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * What the solver says about each rule of the data model it is given: the
 * oracle's verdict, its sentence and its proof, keyed by the rule. Proving
 * takes every feature that writes what the rules read, so it is asked apart
 * from the reading. `quick=1` answers at once with the verdicts the induction
 * settles alone; the others come without it.
 */
export const GET: RequestHandler = async (event) => {
	// Proof by the solver is an Enterprise capability: elsewhere this route does not exist.
	if (!event.locals.services.proofs) error(404, 'Not found');
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const steps = Number(event.url.searchParams.get('maxSteps'));
	const verdicts = await event.locals.services.readDataRules.verdicts(
		projectId,
		Number.isInteger(steps) && steps > 0 ? steps : undefined,
		event.url.searchParams.get('quick') === '1'
	);
	if (verdicts === null) error(503, 'The behavior engine did not answer.');
	return json({ verdicts });
};
