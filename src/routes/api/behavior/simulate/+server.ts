import { error, json } from '@sveltejs/kit';
import { resolveWalkTarget } from '$application/use-cases';
import { isDraftLeafId } from '$domain/evolution';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { requireEvolutionAccess } from '$lib/server/community-locks.server';
import type { RequestHandler } from './$types';

/** The most steps one walk runs, as the engine caps it: a flow, not a load test. */
const MAX_STEPS = 50;

const isObject = (v: unknown): v is Record<string, unknown> =>
	v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Walk a feature step by step through the platform's engine, WITHOUT saving
 * anything: the simulation the standalone engine offers, under Lyriks auth, so
 * an AI client can try a feature while it writes it. Body: `{ projectId,
 * featureId, steps[], operations?, snapshot?, personaId?, stopOnBlocked? }`.
 *
 * `featureId` is a kernel feature of the project, or a draft an Evolution
 * request carries (`draft:…`): an amendment or a removal is walked over the
 * feature it stands for, an addition over an empty feature. `operations` (the
 * apply_behavior_batch vocabulary) are applied in memory first and never saved,
 * which is how a draft, whose behaviour is prose, gets a model to walk.
 *
 * READ access is enough: nothing is written, whatever `operations` say.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	const steps = body?.steps ?? [];
	if (!Array.isArray(steps) || !steps.every(isObject)) {
		error(
			400,
			'steps must be an array of { actionId | actionRef, surfaceId?, parameters?, timeAdvance? }'
		);
	}
	if (steps.length > MAX_STEPS) error(400, `A walk runs at most ${MAX_STEPS} steps`);
	const runScenarios = body?.runScenarios === true;
	const modelCheck = body?.modelCheck;
	if (modelCheck !== undefined && typeof modelCheck !== 'boolean' && !isObject(modelCheck)) {
		error(400, 'modelCheck must be true or { maxDepth?, maxStates? }');
	}
	if (steps.length === 0 && !runScenarios && !modelCheck) {
		error(400, 'Nothing to simulate: send steps, runScenarios:true or modelCheck:true');
	}
	const operations = body?.operations;
	if (operations !== undefined && (!Array.isArray(operations) || !operations.every(isObject))) {
		error(400, 'operations must be an array of apply_behavior_batch operations');
	}
	const snapshot = body?.snapshot;
	if (snapshot !== undefined && !isObject(snapshot)) error(400, 'snapshot must be an object');

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

	const answer = await services.simulateBehavior.execute({
		target: resolved.target,
		args: {
			...(steps.length > 0 ? { steps: steps as Record<string, unknown>[] } : {}),
			// The project's cross-feature invariants hold on every step, a draft's included.
			projectId,
			...(operations ? { operations: operations as Record<string, unknown>[] } : {}),
			...(snapshot ? { snapshot } : {}),
			...(typeof body?.personaId === 'string' ? { personaId: body.personaId } : {}),
			...(body?.stopOnBlocked === true ? { stopOnBlocked: true } : {}),
			...(runScenarios ? { runScenarios: true } : {}),
			...(modelCheck
				? {
						modelCheck: modelCheck as
							boolean | { readonly maxDepth?: number; readonly maxStates?: number }
					}
				: {})
		}
	});
	if (!answer) error(503, 'The behavior engine did not answer this simulation.');
	// A walk the engine could not start (an action or a persona the feature does
	// not hold) is the caller's to fix: say it as the engine wrote it.
	if (answer.kind === 'refused') {
		return json({
			available: true,
			ok: false,
			persisted: false,
			errors: [answer.error]
		});
	}
	const target = resolved.target;
	// The replay of a draft's own model is the engine's bookkeeping; only the
	// operations this call sent deserve a batch report.
	const { batch, ...walk } = answer.walk as Record<string, unknown>;
	return json({
		available: true,
		...walk,
		...(operations && operations.length > 0 && batch ? { batch } : {}),
		simulated:
			target.kind === 'feature'
				? { kind: 'feature', featureId: target.featureId }
				: {
						kind: 'draft',
						draftId: target.draftId,
						draftKind: target.draftKind,
						requestId: target.requestId,
						over: target.baseLeafId ?? 'an empty feature'
					}
	});
};
