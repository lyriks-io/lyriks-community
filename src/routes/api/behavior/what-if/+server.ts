import { error, json } from '@sveltejs/kit';
import { resolveWalkTarget } from '$application/use-cases';
import { isDraftLeafId } from '$domain/evolution';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import type { RequestHandler } from './$types';

const isObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * What a change would do to a feature, WITHOUT saving it and without a
 * language model: the solver proves the feature before and after, the authored
 * scenarios run on both, and the answer is the difference. Body: `{ projectId,
 * featureId, operations?, maxSteps? }`.
 *
 * `featureId` is a kernel feature of the project, with the `operations` of the
 * change (the apply_behavior_batch vocabulary), or a draft an Evolution request
 * carries (`draft:…`): its behaviour model is the change, and `operations` go
 * on top of it. READ access is enough: nothing is written.
 */
export const POST: RequestHandler = async (event) => {
	// Proof by the solver is an Enterprise capability: elsewhere this route does not exist.
	if (!event.locals.services.proofs) error(404, 'Not found');
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	const operations = body?.operations;
	if (operations !== undefined && (!Array.isArray(operations) || !operations.every(isObject))) {
		error(400, 'operations must be an array of apply_behavior_batch operations');
	}
	const maxSteps = typeof body?.maxSteps === 'number' && body.maxSteps > 0 ? Math.floor(body.maxSteps) : undefined;

	const services = event.locals.services;
	let resolved: ReturnType<typeof resolveWalkTarget>;
	if (isDraftLeafId(featureId)) {
		// A draft lives in an Evolution request: Community refuses it.
		requireEvolutionAccess(services);
		await requireProjectAccess(event, projectId, 'read');
		const evolution = await services.loadEvolutionDraft.execute(projectId);
		resolved = resolveWalkTarget(featureId, evolution, (operations?.length ?? 0) > 0);
		if (!resolved.ok) error(resolved.status, resolved.message);
		const base = resolved.target.kind === 'draft' ? resolved.target.baseLeafId : null;
		if (base) await requireBehaviorFeatureAccess(event, projectId, base, 'read');
	} else {
		await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
		resolved = resolveWalkTarget(featureId, { requests: [] }, false);
	}
	if (!resolved.ok) error(resolved.status, resolved.message);

	const answer = await services.whatIf.execute({
		target: resolved.target,
		projectId,
		...(operations ? { operations: operations as Record<string, unknown>[] } : {}),
		...(maxSteps ? { maxSteps } : {})
	});
	if (!answer) error(503, 'The behavior engine did not answer this comparison.');
	if (answer.kind === 'refused') {
		return json({ available: true, ok: false, persisted: false, errors: [answer.error] });
	}
	return json({ available: true, ...answer.comparison, persisted: false });
};
