import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import { scheduleImplementationReconcile } from '$lib/server/implementation-reconcile.server';
import type { BehavioralIndexPayload } from '$application/ports';
import type { RequestHandler } from './$types';

/**
 * The spec↔code map — `.unspa.json`'s `index`, which lives in the CALLER's
 * checkout, not here.
 *
 * That split is the whole design. The agent holds the filesystem and the
 * platform holds the spec, so `GET` hands back entries for the agent to write,
 * and `POST` takes the agent's index back to resolve it against the spec. The
 * platform stores no copy: one index, in the repo, versioned with the code it
 * describes.
 */

/**
 * Seed index entries from a finalized analysis — every code span becomes an
 * entry with `{file, line, signature}` and a stamped `specVersion`, which is
 * what arms drift detection. Returns them; writes nothing anywhere.
 */
export const GET: RequestHandler = async (event) => {
	const params = event.url.searchParams;
	const projectId = params.get('projectId') ?? '';
	const featureId = params.get('featureId') ?? '';
	if (!projectId || !featureId) error(400, 'projectId and featureId are required');

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	const result = await getServices().codeAdoption.seedIndexFromAnalysis(featureId, {
		overwrite: params.get('overwrite') === 'true'
	});
	if (result === null) error(503, 'Behavior engine unavailable');
	if (!result.ok) return json({ available: true, ok: false, error: result.error });
	return json({
		available: true,
		ok: true,
		...result.value,
		semantics: {
			entries:
				'Write these under `index` in your repo\'s .unspa.json, then POST the whole index back here to sync coverage.',
			persisted: 'Nothing was written server-side — the index belongs to your checkout.'
		}
	});
};

/**
 * Sync coverage from the caller's index: the engine resolves every key against
 * the spec and reports status for each action and surface in one pass.
 *
 * Project-scoped rather than feature-scoped because one index covers all of a
 * project's features (ids are unique system-wide, so it is never partitioned).
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		index?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!body?.index || typeof body.index !== 'object' || Array.isArray(body.index)) {
		error(400, 'index must be an object keyed by "<type>:<id>"');
	}

	await requireProjectAccess(event, projectId, 'write');
	const services = getServices();
	const result = await services.codeAdoption.syncImplementationIndex(
		projectId,
		body.index as BehavioralIndexPayload
	);
	// A landed sync changes what the Features chips should say; recompute the
	// cached coverage now instead of waiting out its TTL, and align feature
	// workflow statuses with the new coverage (upgrade-only, in the background).
	if (result?.ok) {
		services.implementationCoverage.invalidate(projectId);
		scheduleImplementationReconcile(projectId);
	}
	return adoptionJson(result);
};
