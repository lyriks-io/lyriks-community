import { error, json } from '@sveltejs/kit';
import { requireProjectAccess } from '$lib/server/project-access.server';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import type { RequestHandler } from './$types';

/**
 * What holds across a project's features, in the behavior engine: invariants
 * spanning features, canonical state variables (with drift from the data field
 * each mirrors), the core registry (declared from the feature tree) and the
 * library of entities, resources and personas the features reference.
 *
 *   GET  /api/behavior/project?projectId=<id>
 *   POST /api/behavior/project { projectId, operations[], dryRun? }
 */
export const GET: RequestHandler = async (event) => {
	const projectId = event.url.searchParams.get('projectId') ?? '';
	if (!projectId) error(400, 'projectId is required');
	await requireProjectAccess(event, projectId, 'read');
	const behavior = await event.locals.services.readProjectBehavior.execute(projectId);
	if (!behavior)
		error(503, 'The behavior engine did not answer, or holds no record of this project yet.');
	return json({ available: true, projectId, ...behavior });
};

export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	const operations = body?.operations;
	if (
		!Array.isArray(operations) ||
		operations.length === 0 ||
		!operations.every((op) => op && typeof op === 'object' && !Array.isArray(op))
	) {
		error(400, 'operations must be a non-empty array of { kind, ... }');
	}
	await requireProjectAccess(event, projectId, 'write');
	const services = event.locals.services;
	for (const op of operations as Record<string, unknown>[]) {
		if ((op.kind ?? op.op) !== 'promote_to_project_library' || typeof op.featureId !== 'string') continue;
		await requireBehaviorFeatureAccess(event, projectId, op.featureId, 'write');
		const clashes = await featureIdCollisions(services, projectId, op.featureId);
		if (clashes.length > 0) error(409, featureIdCollisionMessage(projectId, op.featureId, clashes));
	}
	const dryRun = body?.dryRun === true;
	const result = await services.authorProjectBehavior.execute({
		projectId,
		operations: operations as Record<string, unknown>[],
		dryRun
	});
	if (!result) error(503, 'The behavior engine did not answer; nothing was written.');
	if (result.kind === 'refused') {
		const errors = 'errors' in result ? result.errors : [result.error];
		return json({ available: true, ok: false, dryRun, projectId, errors });
	}
	const answer = result.value as { ok?: unknown };
	if (answer.ok !== false && !dryRun) {
		services.implementationCoverage.invalidate(projectId);
		void services.scheduleBackSync(projectId).catch(() => {});
	}
	return json({ available: true, ...result.value });
};
