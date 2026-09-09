import { error, json } from '@sveltejs/kit';
import { getServices } from '$composition/container.server';
import { requireBehaviorFeatureAccess } from '$lib/server/behavior-feature-access.server';
import { requireProjectAccess } from '$lib/server/project-access.server';
import { adoptionJson } from '$lib/server/adoption-endpoint.server';
import type { BehavioralIndexPayload } from '$application/ports';
import type { RequestHandler } from './$types';

/**
 * What the spec declares that the index has not located in code yet.
 *
 * POST, not GET, because the index travels in the body: it lives in the caller's
 * checkout and routinely runs to hundreds of entries, well past what a query
 * string should carry. Read-only despite the verb.
 *
 * `entries=true` returns the raw index slice instead of the cross-reference —
 * the same index, read back through the engine's own filters and pagination.
 *
 * With no `featureId`, the answer is the project-wide roll-up (which features
 * still hold unlocated spec entities), so "what is there left to build" is one
 * call rather than a loop every caller has to write.
 */
export const POST: RequestHandler = async (event) => {
	const body = (await event.request.json().catch(() => null)) as {
		projectId?: unknown;
		featureId?: unknown;
		index?: unknown;
		entries?: unknown;
		filters?: unknown;
	} | null;

	const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
	if (!projectId) error(400, 'projectId is required');
	if (!body?.index || typeof body.index !== 'object' || Array.isArray(body.index)) {
		error(400, 'index must be an object keyed by "<type>:<id>"');
	}
	const index = body.index as BehavioralIndexPayload;
	const adoption = getServices().codeAdoption;

	if (body.entries === true) {
		await requireProjectAccess(event, projectId, 'read');
		const filters =
			body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
				? (body.filters as Record<string, unknown>)
				: undefined;
		return adoptionJson(await adoption.getBehavioralIndex(projectId, index, filters));
	}

	const featureId = typeof body.featureId === 'string' ? body.featureId : '';
	if (!featureId) {
		// No feature named: answer for the whole project instead of refusing. The
		// roll-up says which features still hold unlocated entities; a scoped call
		// then says which entities. Feature access is project access plus an
		// ownership check, so the sweep needs no wider authority than one feature.
		await requireProjectAccess(event, projectId, 'read');
		return json(await getServices().sweepImplementationGaps.execute(projectId, index));
	}

	await requireBehaviorFeatureAccess(event, projectId, featureId, 'read');
	return adoptionJson(await adoption.getImplementationGaps(featureId, projectId, index));
};
