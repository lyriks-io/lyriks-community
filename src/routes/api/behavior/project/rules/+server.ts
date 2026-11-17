import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

/**
 * The oracle's answer for every rule that spans the project (its project
 * invariants, the data model's among them): one verdict per rule over the
 * whole project, with its proof, the actions that would break it, who writes
 * and reads it, one sentence in the spec's language, and the link a person
 * opens. Read access is enough: nothing is written. `quick=1` answers at once
 * with the verdicts the induction settles alone.
 */
export const GET: RequestHandler = async (event) => {
	// Proof by the solver is an Enterprise capability: elsewhere this route does not exist.
	if (!event.locals.services.proofs) error(404, 'Not found');
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const ids = event.url.searchParams.getAll('invariantId').filter(Boolean);
	const steps = Number(event.url.searchParams.get('maxSteps'));
	const answer = await event.locals.services.projectRulesOracle.prove(projectId, {
		...(ids.length > 0 ? { invariantIds: ids } : {}),
		...(Number.isInteger(steps) && steps > 0 ? { maxSteps: steps } : {}),
		...(event.url.searchParams.get('quick') === '1' ? { quick: true } : {})
	});
	if (!answer) error(503, 'The behavior engine did not answer.');
	if (answer.kind === 'refused') return json({ available: true, ok: false, errors: [answer.error] });
	return json({ available: true, ok: true, ...answer.value });
};
