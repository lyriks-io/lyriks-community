import { error } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import { scheduleImplementationReconcile } from '$lib/server/implementation-reconcile.server';
import type { FoundEntityInput, ReportImplementationInput } from '$application/ports';
import type { RequestHandler } from './$types';

/**
 * Per-entity implementation status: where each spec element lives in the code,
 * as the caller found it.
 *
 * Locations are reported BY the caller — this server never opens a repo file.
 * Prefer syncing a whole index (`../index`) once one exists; this is the
 * fine-grained path for tagging coverage as you model, before there is one.
 */

/** Current status for one feature. */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const surfaceId = params.get('surfaceId');
	const actionId = params.get('actionId');
	return adoptionJson(
		await getServices().codeAdoption.getImplementationStatus(featureId, {
			...(surfaceId ? { surfaceId } : {}),
			...(actionId ? { actionId } : {})
		})
	);
};

/**
 * Report status for one action/surface, or many at once via `entries[]`.
 *
 * The batch form is not a convenience: adoption reports dozens of scopes per
 * feature, and one round trip each is what makes the loop unaffordable.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		actionId?: unknown;
		surfaceId?: unknown;
		foundEntities?: unknown;
		entries?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	// A globally addressed write on an id another project also claims would land
	// in their record; refuse while it is still a message.
	const clashes = await featureIdCollisions(projectId, featureId);
	if (clashes.length > 0) error(409, featureIdCollisionMessage(projectId, featureId, clashes));
	const services = getServices();
	const adoption = services.codeAdoption;

	if (Array.isArray(body?.entries)) {
		if (body.entries.length === 0) error(400, 'entries must be a non-empty array');
		const result = await adoption.reportImplementationStatusBatch(
			featureId,
			body.entries as Omit<ReportImplementationInput, 'featureId'>[]
		);
		// A landed report changes what the Features chips should say; recompute
		// the cached coverage now instead of waiting out its TTL, and align this
		// feature's workflow status with it (upgrade-only, in the background).
		if (result?.ok) {
			services.implementationCoverage.invalidate(projectId);
			scheduleImplementationReconcile(projectId, [featureId]);
		}
		return adoptionJson(result);
	}

	if (!Array.isArray(body?.foundEntities)) {
		error(400, 'foundEntities must be an array (or pass entries[] for the batch form)');
	}
	const result = await adoption.reportImplementationStatus({
		featureId,
		...(typeof body.actionId === 'string' ? { actionId: body.actionId } : {}),
		...(typeof body.surfaceId === 'string' ? { surfaceId: body.surfaceId } : {}),
		foundEntities: body.foundEntities as FoundEntityInput[]
	});
	if (result?.ok) {
		services.implementationCoverage.invalidate(projectId);
		scheduleImplementationReconcile(projectId, [featureId]);
	}
	return adoptionJson(result);
};
