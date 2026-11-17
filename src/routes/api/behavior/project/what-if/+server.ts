import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import type { RequestHandler } from './$types';

const isObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * What a change to the project's rules would do, WITHOUT saving it: body
 * `{ projectId, operations, maxSteps? }`, the operations in the project batch
 * vocabulary (add, update or remove a project invariant). The answer lists every
 * rule, scenario and action that moves, and a headline in the spec's language.
 * Read access is enough: nothing is written.
 */
export const POST: RequestHandler = async (event) => {
	// Proof by the solver is an Enterprise capability: elsewhere this route does not exist.
	if (!event.locals.services.proofs) error(404, 'Not found');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const operations = body?.operations;
	if (!projectId || !Array.isArray(operations) || operations.length === 0 || !operations.every(isObject)) {
		error(400, 'projectId and a non-empty operations array are required');
	}
	await requireProjectAccess(event, projectId, 'read');
	const steps = typeof body?.maxSteps === 'number' && body.maxSteps > 0 ? Math.floor(body.maxSteps) : undefined;
	const answer = await event.locals.services.projectRulesOracle.whatIf(projectId, operations as Record<string, unknown>[], steps);
	if (!answer) error(503, 'The behavior engine did not answer.');
	if (answer.kind === 'refused') return json({ available: true, ok: false, persisted: false, errors: [answer.error] });
	return json({ available: true, ...answer.value, persisted: false });
};
