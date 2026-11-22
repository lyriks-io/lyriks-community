import { error, json } from '@sveltejs/kit';
import {
	featureIdCollisionMessage,
	featureIdCollisions,
	requireBehaviorFeatureAccess
} from '$lib/server/behavior-feature-access.server';
import { adoptionBody } from '$lib/server/adoption-endpoint.server';
import { expectedRevisionOf, guardedIndexWrite } from '$lib/server/implementation-index-write.server';
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

/** Current status for one feature, with the revision of the project's index it reads (criterion fbe61ab1). */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const surfaceId = params.get('surfaceId');
	const actionId = params.get('actionId');
	const services = event.locals.services;
	const [status, revision] = await Promise.all([
		services.codeAdoption.getImplementationStatus(featureId, {
			...(surfaceId ? { surfaceId } : {}),
			...(actionId ? { actionId } : {})
		}),
		services.guardIndexWrite.current(projectId)
	]);
	return json({ ...adoptionBody(status), revision });
};

/**
 * Report status for one action/surface, or many at once via `entries[]`.
 *
 * The batch form is not a convenience: adoption reports dozens of scopes per
 * feature, and one round trip each is what makes the loop unaffordable. A
 * report replaces what was located under its action or surface, as a sync
 * does, so it answers the revision of the project's index and, sent against an
 * older one, is refused where a write since then replaced it (rule fc406a24).
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		actionId?: unknown;
		surfaceId?: unknown;
		foundEntities?: unknown;
		entries?: unknown;
		expectedRevision?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	const featureId = typeof body?.featureId === 'string' ? body.featureId : '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');
	const expected = expectedRevisionOf(body?.expectedRevision);

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'write');
	// A globally addressed write on an id another project also claims would land
	// in their record; refuse while it is still a message.
	const clashes = await featureIdCollisions(event.locals.services, projectId, featureId);
	if (clashes.length > 0) error(409, featureIdCollisionMessage(projectId, featureId, clashes));
	const services = event.locals.services;
	const adoption = services.codeAdoption;

	if (Array.isArray(body?.entries)) {
		if (body.entries.length === 0) error(400, 'entries must be a non-empty array');
		const entries = body.entries as Omit<ReportImplementationInput, 'featureId'>[];
		const units = entries.map(unitOf).filter((unit): unit is string => unit !== null);
		return guardedIndexWrite(services, projectId, units, expected, async () => {
			const result = await adoption.reportImplementationStatusBatch(featureId, entries);
			// A landed report changes what the Features chips should say; recompute
			// the cached coverage now instead of waiting out its TTL.
			if (result?.ok) services.implementationCoverage.invalidate(projectId);
			return { written: result?.ok ? units : null, value: adoptionBody(result) };
		});
	}

	if (!Array.isArray(body?.foundEntities)) {
		error(400, 'foundEntities must be an array (or pass entries[] for the batch form)');
	}
	const scope = {
		...(typeof body.actionId === 'string' ? { actionId: body.actionId } : {}),
		...(typeof body.surfaceId === 'string' ? { surfaceId: body.surfaceId } : {})
	};
	const unit = unitOf(scope);
	const units = unit ? [unit] : [];
	const foundEntities = body.foundEntities as FoundEntityInput[];
	return guardedIndexWrite(services, projectId, units, expected, async () => {
		const result = await adoption.reportImplementationStatus({ featureId, ...scope, foundEntities });
		if (result?.ok) services.implementationCoverage.invalidate(projectId);
		return { written: result?.ok ? units : null, value: adoptionBody(result) };
	});
};

/** The index key of the action or surface a report replaces. */
function unitOf(scope: { readonly actionId?: unknown; readonly surfaceId?: unknown }): string | null {
	if (typeof scope.actionId === 'string' && scope.actionId) return `action:${scope.actionId}`;
	if (typeof scope.surfaceId === 'string' && scope.surfaceId) return `surface:${scope.surfaceId}`;
	return null;
}
